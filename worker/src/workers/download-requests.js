/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Common from 'common';
import CommonBackend from 'common-backend';

import genNetWorth from '../calculations/genNetWorth';
import genSavingsRate from '../calculations/genSavingsRate';
import getAccountFromPlaidAccount from '../calculations/getAccountFromPlaidAccount';
import getTransactionFromPlaidTransaction from '../calculations/getTransactionFromPlaidTransaction';
import nullthrows from 'nullthrows';

import { ERROR, INFO } from '../log-utils';
import { genPlaidAccounts, genPlaidTransactions } from '../plaid-client';

import type {
  Account,
  PlaidCredentials,
  UserMetrics,
} from 'common/src/types/db';
import type {
  Account as Plaid$Account,
  Transaction as Plaid$Transaction,
} from 'common/src/types/plaid';
import type { ID } from 'common/src/types/core';

const { DB } = CommonBackend;

export function initialize(workerID: ID): void {
  INFO('INITIALIZATION', 'Initializating download-request worker');
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
  const { credentialsID } = payload;

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
  const plaidAccounts = await genPlaidAccounts(credentials);

  INFO('PLAID', 'Writing plaid accounts to Firebase');
  const accountGenerators: Array<Promise<Account>> = plaidAccounts.map(
    rawAccount => genCreateAccount(rawAccount, nullthrows(credentials)),
  );

  await Promise.all(accountGenerators);

  INFO('PLAID', 'Fetching plaid transactions');
  // $FlowFixMe - Why is this an error?
  const plaidTransactions = await genPlaidTransactions(credentials);

  INFO('PLAID', 'Writing plaid transactions to Firebase');
  await Promise.all(
    plaidTransactions.map(plaidTransaction =>
      genCreateTransaction(plaidTransaction, nullthrows(credentials)),
    ),
  );

  INFO('PLAID', 'Marking credentials download status as COMPLETE');
  const now = new Date();
  credentials = {
    ...Common.DBUtils.updateModelStub(credentials),
    downloadStatus: { downloadedAt: now, type: 'COMPLETE' },
  };

  await genUpdateCredentials(credentials);

  INFO('PLAID', 'Updating core metrics');

  const userMetrics = await genUserMetrics(credentials.userRef.refID);
  const [netWorth, savingsRate] = await Promise.all([
    genNetWorth(credentials.userRef.refID),
    genSavingsRate(credentials.userRef.refID),
  ]);

  const newUserMetrics = userMetrics
    ? {
        ...Common.DBUtils.updateModelStub(userMetrics),
        netWorth,
        savingsRate,
      }
    : {
        ...Common.DBUtils.createModelStub('UserMetrics'),
        netWorth,
        savingsRate,
      };

  await genUpsertUserMetrics(newUserMetrics);

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
  plaidAccount: Plaid$Account,
  credentials: PlaidCredentials,
): Promise<Account> {
  const account = getAccountFromPlaidAccount(plaidAccount, credentials);
  await FirebaseAdmin.firestore()
    .collection('Accounts')
    .doc(account.id)
    .set(account);
  return account;
}

async function genCreateTransaction(
  plaidTransaction: Plaid$Transaction,
  credentials: PlaidCredentials,
) {
  const transaction = getTransactionFromPlaidTransaction(
    plaidTransaction,
    credentials,
  );

  await DB.transformError(
    FirebaseAdmin.firestore()
      .collection('Transactions')
      .doc(transaction.id)
      .set(transaction),
  );
  return transaction;
}

async function genUserMetrics(userID: ID): Promise<?UserMetrics> {
  const document = await FirebaseAdmin.firestore()
    .collection('UserMetrics')
    .doc(userID)
    .get();

  if (!document.exists) {
    return null;
  }
  return document.data();
}

async function genUpsertUserMetrics(userMetrics: UserMetrics): Promise<void> {
  await FirebaseAdmin.firestore()
    .collection('UserMetrics')
    .doc(userMetrics.id)
    .set(userMetrics);
}
