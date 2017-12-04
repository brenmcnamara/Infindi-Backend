/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Plaid from 'plaid';

import invariant from 'invariant';
import chalk from 'chalk';
import uuid from 'uuid/v4';

import {
  type Account,
  type PlaidCredentials,
  type PlaidDownloadRequest,
  type Transaction,
} from '../types/db';
import {
  type Account as Plaid$Account,
  type PlaidDate,
  type Transaction as Plaid$Transaction,
} from '../types/plaid';
import { type Firebase$DataSnapshot } from '../types/firebase';
import { type ID, type Seconds } from '../types/core';

type DownloadRequestSnapshot = Firebase$DataSnapshot<PlaidDownloadRequest>;

const ABORT_TRANSACTION = undefined;
const CLAIM_MAX_TIMEOUT: Seconds = 60;
const YEAR_IN_MILLIS = 1000 * 60 * 60 * 24 * 365;

let workerID: ?ID = null;
let plaidClient;
const activeRequests: { [id: ID]: PlaidDownloadRequest } = {};

export function initialize(): void {
  plaidClient = new Plaid.Client(
    process.env.PLAID_CLIENT_ID,
    process.env.PLAID_SECRET,
    process.env.PLAID_PUBLIC_KEY,
    Plaid.environments[process.env.PLAID_ENV],
  );
  workerID = uuid();

  const downloadRequestsRef = FirebaseAdmin.database().ref(
    'PlaidDownloadRequests',
  );

  downloadRequestsRef.on('child_changed', onUpsertDownloadRequest);
  downloadRequestsRef.on('child_added', onUpsertDownloadRequest);
  downloadRequestsRef.on('child_removed', onRemoveDownloadRequest);
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
// DOWNLOAD REQUEST LISTENERS
//
// -----------------------------------------------------------------------------

async function onUpsertDownloadRequest(snapshot: DownloadRequestSnapshot) {
  const request = snapshot.val();
  if (!request) {
    return;
  }
  const uid = request.userRef.refID;
  if (request.status.type === 'CANCELED' && activeRequests[request.id]) {
    // TODO: Cancel the request and stop doing the work.
  }
  if (request.status.type !== 'NOT_INITIALIZED') {
    return;
  }
  const isClaimed = await genAttemptRequestClaim(request);
  if (!isClaimed) {
    return;
  }

  // Start the download request.
  try {
    await genDownloadRequest(uid, request);
  } catch (error /* InfindiError */) {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const errorCode = error.errorCode || 'infindi/server-error';
    const errorMessage = error.errorMessage || error.toString();
    await FirebaseAdmin.database()
      .ref(`PlaidDownloadRequests/${request.id}`)
      .set({
        ...request,
        status: {
          errorCode,
          errorMessage,
          type: 'FAILURE',
        },
        updatedAt: nowInSeconds,
      });
  }
}

async function onRemoveDownloadRequest(snapshot: DownloadRequestSnapshot) {
  // TODO: What do I do here?
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

// TODO: Add cancel checks intermittently throughout this request.
async function genDownloadRequest(uid: ID, request: PlaidDownloadRequest) {
  const startTimeMillis = Date.now();

  activeRequests[request.id] = request;

  const credentials = await genCredentials(request.id);
  if (!credentials) {
    throw {
      errorCode: 'infindi/server-error',
      // eslint-disable-next-line max-len
      errorMessage: `Failed to initiate download request. Could not find credentials with download id ${
        request.id
      }`,
    };
  }

  // Download user accounts.
  // $FlowFixMe - Why is this an error?
  const plaidAccounts = await genPlaidAccounts(
    plaidClient,
    credentials.accessToken,
  );

  const accountGenerators: Array<Promise<Plaid$Account>> = plaidAccounts.map(
    rawAccount => genCreateAccount(uid, rawAccount),
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
      genCreateTransaction(uid, transaction),
    ),
  );

  // TODO: For each user account, download the transactions for the last 2
  // year.
  const endTimeMillis = Date.now();

  const totalDownloadTime: Seconds = Math.floor(
    (endTimeMillis - startTimeMillis) / 1000,
  );

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const newRequest: PlaidDownloadRequest = {
    ...request,
    status: {
      totalDownloadTime,
      type: 'COMPLETE',
    },
    updatedAt: nowInSeconds,
  };
  try {
    await FirebaseAdmin.database()
      .ref(`PlaidDownloadRequests/${request.id}`)
      .set(newRequest);
  } catch (error) {
    const errorCode = error.code || 'infindi/server-error';
    const errorMessage = error.toString();
    throw { errorCode, errorMessage };
  }
}

async function genAttemptRequestClaim(request: PlaidDownloadRequest) {
  invariant(
    request.status.type === 'NOT_INITIALIZED',
    'Attempting to claim request that is known to be claimed',
  );

  function transaction(request: ?PlaidDownloadRequest) {
    if (!request) {
      return null;
    }

    if (request.status.type !== 'NOT_INITIALIZED') {
      // Another worker beat us to the request.
      return ABORT_TRANSACTION;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    return {
      ...request,
      status: {
        claim: {
          createdAt: nowInSeconds,
          timeout: CLAIM_MAX_TIMEOUT,
          updatedAt: nowInSeconds,
          workerID: getWorkerID(),
        },
        type: 'IN_PROGRESS',
      },
      updatedAt: nowInSeconds,
    };
  }

  let transactionResult;
  try {
    transactionResult = await FirebaseAdmin.database()
      .ref(`PlaidDownloadRequests/${request.id}`)
      .transaction(transaction);
  } catch (error) {
    const errorCode = error.code || 'infindi/server-error';
    const errorMessage = error.toString();
    throw { errorCode, errorMessage };
  }
  return transactionResult.committed;
}

async function genCredentials(credentialsID: ID): Promise<?PlaidCredentials> {
  let snapshot: Firebase$DataSnapshot<PlaidCredentials>;
  try {
    snapshot = await FirebaseAdmin.database()
      .ref(`PlaidCredentials/${credentialsID}`)
      .once('value');
  } catch (error) {
    const errorCode = error.code || 'infindi/server-error';
    const errorMessage = error.toString();
    throw { errorCode, errorMessage };
  }
  return snapshot.val();
}

async function genCreateAccount(
  uid: ID,
  rawPlaidAccount: Plaid$Account,
): Promise<Account> {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const id = rawPlaidAccount.account_id;

  const account: Account = {
    alias: null,
    balance: rawPlaidAccount.balances.current,
    createdAt: nowInSeconds,
    id,
    modelType: 'Account',
    name: rawPlaidAccount.name,
    sourceOfTruth: {
      type: 'PLAID',
      value: rawPlaidAccount,
    },
    type: 'MODEL',
    updatedAt: nowInSeconds,
    userRef: {
      pointerType: 'User',
      type: 'POINTER',
      refID: uid,
    },
  };

  try {
    await FirebaseAdmin.database()
      .ref(`Accounts/${id}`)
      .set(account);
  } catch (error) {
    const errorCode = error.code || 'infindi/server-error';
    const errorMessage = error.toString();
    throw { errorCode, errorMessage };
  }

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
  const nowInSeconds = Math.floor(Date.now() / 1000);
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
    createdAt: nowInSeconds,
    id: rawTransaction.transaction_id,
    modelType: 'Transaction',
    name: rawTransaction.name,
    sourceOfTruth: {
      type: 'PLAID',
      value: rawTransaction,
    },
    transactionDate: Math.floor(
      getUTCDate(rawTransaction.date).getTime() / 1000,
    ),
    type: 'MODEL',
    updatedAt: nowInSeconds,
    userRef: {
      pointerType: 'User',
      type: 'POINTER',
      refID: uid,
    },
  };
  try {
    await FirebaseAdmin.database()
      .ref(`Transactions/${transaction.id}`)
      .set(transaction);
  } catch (error) {
    const errorCode = error.code || 'infindi/server-error';
    const errorMessage = error.toString();
    throw { errorCode, errorMessage };
  }
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
