/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Common from 'common';
import CommonBackend from 'common-backend';
import Plaid from 'plaid';

import getAccountFromPlaidAccount from '../calculations/getAccountFromPlaidAccount';

import { ERROR, INFO } from '../log-utils';

import type {
  Account,
  PlaidCredentials,
  Transaction,
} from 'common/src/types/db';
import type {
  Account as Plaid$Account,
  PlaidDate,
  Transaction as Plaid$Transaction,
} from 'common/src/types/plaid';
import type { ID } from 'common/src/types/core';

const YEAR_IN_MILLIS = 1000 * 60 * 60 * 24 * 365;

const { DB } = CommonBackend;

let plaidClient;

export function initialize(workerID: ID): void {
  INFO('INITIALIZATION', 'Initializating download-request worker');

  plaidClient = new Plaid.Client(
    process.env.PLAID_CLIENT_ID,
    process.env.PLAID_SECRET,
    process.env.PLAID_PUBLIC_KEY,
    Plaid.environments[process.env.PLAID_ENV],
  );

  CommonBackend.Job.listenToJobRequest(
    'PLAID_INITIAL_DOWNLOAD',
    workerID,
    genDownloadRequest,
  );
}

// -----------------------------------------------------------------------------
//
// DOWNLOAD REQUEST JOB
//
// -----------------------------------------------------------------------------

// TODO: Add cancel checks intermittently throughout this request.
async function genDownloadRequest(payload: Object) {
  INFO('PLAID', 'Detecting download request for plaid item');
  const { credentialsID, userID } = payload;

  let credentials = await genCredentials(credentialsID);

  if (!credentials) {
    ERROR('PLAID', 'Failed to find desired plaid credentials for download');
    const errorCode = 'infindi/resource-not-found';
    const errorMessage = `Missing credentials: ${credentialsID}`;
    const toString = () => `[${errorCode}]: ${errorMessage}`;
    throw { errorCode, errorMessage, toString };
  }

  if (credentials.downloadStatus.type === 'RUNNING') {
    ERROR(
      'PLAID',
      'Running download request on credentials that have download running',
    );
    const errorCode = 'infindi/bad-request';
    const errorMessage =
      'Running download request on credentials that have download running';
    const toString = () => `[${errorCode}]: ${errorMessage}`;
    throw { errorCode, errorMessage, toString };
  }

  credentials = {
    ...Common.DBUtils.updateModelStub(credentials),
    downloadStatus: { type: 'RUNNING' },
  };
  await genUpdateCredentials(credentials);

  INFO('PLAID', 'Fetching plaid accounts');
  // $FlowFixMe - Why is this an error?
  const plaidAccounts = await genPlaidAccounts(
    plaidClient,
    credentials.accessToken,
  );

  INFO('PLAID', 'Writing plaid accounts to Firebase');
  const accountGenerators: Array<Promise<Plaid$Account>> = plaidAccounts.map(
    // $FlowFixMe - Credentials can't be null at this point.
    rawAccount => genCreateAccount(rawAccount, credentials),
  );

  await Promise.all(accountGenerators);

  INFO('PLAID', 'Fetching plaid transactions');
  // $FlowFixMe - Why is this an error?
  const plaidTransactions = await genPlaidTransactions(
    plaidClient,
    credentials.accessToken,
  );

  INFO('PLAID', 'Writing plaid transactions to Firebase');
  await Promise.all(
    plaidTransactions.map(transaction =>
      genCreateTransaction(userID, transaction),
    ),
  );

  INFO('PLAID', 'Marking credentials download status as COMPLETE');
  const now = new Date();
  credentials = {
    ...Common.DBUtils.updateModelStub(credentials),
    downloadStatus: { downloadedAt: now, type: 'COMPLETE' },
  };

  await genUpdateCredentials(credentials);

  INFO('PLAID', 'Finished downloading plaid credentials');
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

async function genCredentials(
  credentialsID: ID,
): Promise<PlaidCredentials | null> {
  // TODO: Flow typing.
  const document = await DB.transformError(
    FirebaseAdmin.firestore()
      .collection('PlaidCredentials')
      .doc(credentialsID)
      .get(),
  );
  return document.exists ? document.data() : null;
}

async function genUpdateCredentials(
  credentials: PlaidCredentials,
): Promise<void> {
  await FirebaseAdmin.firestore()
    .collection('PlaidCredentials')
    .doc(credentials.id)
    .set(credentials);
}

async function genCreateAccount(
  rawPlaidAccount: Plaid$Account,
  credentials: PlaidCredentials,
): Promise<Account> {
  const account = getAccountFromPlaidAccount(rawPlaidAccount, credentials);
  await DB.transformError(
    FirebaseAdmin.firestore()
      .collection('Accounts')
      .doc(account.id)
      .set(account),
  );
  return account;
}

function genPlaidAccounts(
  client: Object,
  accessToken: string,
): Promise<Array<Plaid$Account>> {
  return new Promise(resolve => {
    client.getAccounts(accessToken, (error, response) => {
      if (error) {
        const errorCode = error.error_code || 'infindi/server-error';
        const errorMessage =
          error.error_message ||
          'Unknown error when fetching accounts from plaid';
        throw { errorCode, errorMessage };
      }
      resolve(response.accounts);
    });
  });
}

function genPlaidTransactions(
  client: Object,
  accessToken: string,
): Promise<Array<Plaid$Transaction>> {
  return new Promise(resolve => {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 2 * YEAR_IN_MILLIS);
    const startPlaidDate = getPlaidDate(startDate);
    const endPlaidDate = getPlaidDate(endDate);
    client.getTransactions(
      accessToken,
      startPlaidDate,
      endPlaidDate,
      (error, response) => {
        if (error) {
          const errorCode = error.error_code || 'infindi/server-error';
          const errorMessage =
            error.error_message ||
            'Unknown plaid error when fetching transactions';
          throw { errorCode, errorMessage };
        }
        const transactions: Array<Plaid$Transaction> = response.transactions;
        resolve(transactions);
      },
    );
  });
}

async function genCreateTransaction(
  uid: ID,
  rawTransaction: Plaid$Transaction,
) {
  const now = new Date();
  const category =
    rawTransaction.category && rawTransaction.category.length > 0
      ? rawTransaction.category[rawTransaction.category.length - 1]
      : null;
  const transaction: Transaction = {
    accountRef: {
      pointerType: 'Account',
      type: 'POINTER',
      refID: rawTransaction.account_id,
    },
    amount: rawTransaction.amount,
    category,
    createdAt: now,
    id: rawTransaction.transaction_id,
    modelType: 'Transaction',
    name: rawTransaction.name,
    sourceOfTruth: {
      type: 'PLAID',
      value: rawTransaction,
    },
    transactionDate: getUTCDate(rawTransaction.date),
    type: 'MODEL',
    updatedAt: now,
    userRef: {
      pointerType: 'User',
      type: 'POINTER',
      refID: uid,
    },
  };

  await DB.transformError(
    FirebaseAdmin.firestore()
      .collection('Transactions')
      .doc(transaction.id)
      .set(transaction),
  );
  return transaction;
}

function getPlaidDate(date: Date): PlaidDate {
  const day = date.getUTCDate();
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();

  const dayFormatted = day < 10 ? `0${day}` : day.toString();
  const monthFormatted = month < 10 ? `0${month}` : month.toString();
  const yearFormatted = year.toString();

  return `${yearFormatted}-${monthFormatted}-${dayFormatted}`;
}

function getUTCDate(plaidDate: PlaidDate): Date {
  const [yearFormatted, monthFormatted, dayFormatted] = plaidDate.split('-');
  const year = parseInt(yearFormatted, 10);
  const month = parseInt(monthFormatted, 10);
  const day = parseInt(dayFormatted, 10);
  return new Date(Date.UTC(year, month, day));
}
