/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import BackendAPI from 'common-backend';
import Plaid from 'plaid';

import invariant from 'invariant';

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

const DB = BackendAPI.DB;

let workerID: ?ID = null;
let plaidClient;

export function initialize(_workerID: ID): void {
  plaidClient = new Plaid.Client(
    process.env.PLAID_CLIENT_ID,
    process.env.PLAID_SECRET,
    process.env.PLAID_PUBLIC_KEY,
    Plaid.environments[process.env.PLAID_ENV],
  );
  workerID = _workerID;

  BackendAPI.Job.listenToJobRequest(
    'PLAID_INITIAL_DOWNLOAD',
    workerID,
    genDownloadRequest,
  );
}

export function getWorkerID(): string {
  invariant(
    workerID,
    'You must initialize plaid worker before fetching worker id',
  );
  return workerID;
}

// -----------------------------------------------------------------------------
//
// DOWNLOAD REQUEST JOB
//
// -----------------------------------------------------------------------------

// TODO: Add cancel checks intermittently throughout this request.
async function genDownloadRequest(payload: Object) {
  const { credentialsID, userID } = payload;

  const credentials = await genCredentials(credentialsID);

  if (!credentials) {
    const errorCode = 'infindi/resource-not-found';
    const errorMessage = `Missing credentials: ${credentialsID}`;
    const toString = () => `[${errorCode}]: ${errorMessage}`;
    throw { errorCode, errorMessage, toString };
  }

  // Download user accounts.
  // $FlowFixMe - Why is this an error?
  const plaidAccounts = await genPlaidAccounts(
    plaidClient,
    credentials.accessToken,
  );

  const accountGenerators: Array<Promise<Plaid$Account>> = plaidAccounts.map(
    rawAccount => genCreateAccount(userID, rawAccount),
  );

  await Promise.all(accountGenerators);

  // Transactions grouped by their accounts.
  // $FlowFixMe - Why is this an error?
  const plaidTransactions = await genPlaidTransactions(
    plaidClient,
    credentials.accessToken,
  );

  await Promise.all(
    plaidTransactions.map(transaction =>
      genCreateTransaction(userID, transaction),
    ),
  );
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

async function genCredentials(credentialsID: ID): Promise<?PlaidCredentials> {
  // TODO: Flow typing.
  const document = await DB.transformError(
    FirebaseAdmin.firestore()
      .collection('PlaidCredentials')
      .doc(credentialsID)
      .get(),
  );
  return document.exists ? document.data() : null;
}

async function genCreateAccount(
  uid: ID,
  rawPlaidAccount: Plaid$Account,
): Promise<Account> {
  const now = new Date();
  const id = rawPlaidAccount.account_id;

  const account: Account = {
    alias: null,
    balance: rawPlaidAccount.balances.current,
    createdAt: now,
    id,
    modelType: 'Account',
    name: rawPlaidAccount.name,
    sourceOfTruth: {
      type: 'PLAID',
      value: rawPlaidAccount,
    },
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
      .collection('Accounts')
      .doc(id)
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
