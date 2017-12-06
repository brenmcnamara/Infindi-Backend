/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Debug from '../debug';
import Plaid from 'plaid';

import invariant from 'invariant';
import uuid from 'uuid/v4';

import type {
  Account,
  PlaidCredentials,
  PlaidDownloadRequest,
  Transaction,
} from 'common/src/types/db';
import type {
  Account as Plaid$Account,
  PlaidDate,
  Transaction as Plaid$Transaction,
} from 'common/src/types/plaid';
import type { ID, Seconds } from 'common/src/types/core';

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

  const downloadRequestsRef = FirebaseAdmin.firestore()
    .collection('PlaidDownloadRequests')
    .where('status.type', '==', 'NOT_INITIALIZED');

  downloadRequestsRef.onSnapshot(onNewDownloadRequest);
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

// TODO: Add typing to snapshot.
async function onNewDownloadRequest(snapshot) {
  // TODO: Flow typing.
  const requestDocs = snapshot.docs;

  async function handleRequest(document) {
    const request = document.data();
    invariant(
      request.status.type === 'NOT_INITIALIZED',
      'Internal error: Expecting request to not be initialized',
    );
    const uid = request.userRef.refID;

    const isClaimed = await genAttemptRequestClaim(request);
    if (!isClaimed) {
      return;
    }

    if (Debug.silentFailDuringPlaidDownloadRequest()) {
      // Exit after claiming request, but don't actually start the download.
      return;
    }

    // Start the download request.
    try {
      await genDownloadRequest(uid, request);
    } catch (error /* InfindiError */) {
      const now = new Date();
      const errorCode = error.errorCode || 'infindi/server-error';
      const errorMessage = error.errorMessage || error.toString();
      await FirebaseAdmin.firestore()
        .collection('PlaidDownloadRequests')
        .doc(request.id)
        .set({
          ...request,
          status: {
            errorCode,
            errorMessage,
            type: 'FAILURE',
          },
          updatedAt: now,
        });
    }
  }

  await Promise.all(requestDocs.map(handleRequest));
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

  if (Debug.failDuringPlaidDownloadRequest()) {
    const errorCode = 'infindi/test-failure';
    const errorMessage = 'Testing failure while downloading request';
    throw { errorCode, errorMessage };
  }

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

  const endTimeMillis = Date.now();

  const totalDownloadTime: Seconds = Math.floor(
    (endTimeMillis - startTimeMillis) / 1000,
  );

  const now = new Date();
  const newRequest: PlaidDownloadRequest = {
    ...request,
    status: {
      totalDownloadTime,
      type: 'COMPLETE',
    },
    updatedAt: now,
  };
  try {
    await FirebaseAdmin.firestore()
      .collection('PlaidDownloadRequests')
      .doc(request.id)
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
    'Attempting to claim request that is not claimable',
  );
  const downloadRequestRef = FirebaseAdmin.firestore()
    .collection('PlaidDownloadRequests')
    .doc(request.id);

  // TODO: Add typing to transactions
  async function transactionOperation(transaction: Object) {
    const document = await transaction.get(downloadRequestRef);

    if (!document.exists || document.data().status.type !== 'NOT_INITIALIZED') {
      // Someone either claimed or deleted this document. We can't claim it
      // anymore.
      return false;
    }

    const request = document.data();

    const now = new Date();
    const newRequest: PlaidDownloadRequest = {
      ...request,
      status: {
        claim: {
          createdAt: now,
          timeout: CLAIM_MAX_TIMEOUT,
          updatedAt: now,
          workerID: getWorkerID(),
        },
        type: 'IN_PROGRESS',
      },
      updatedAt: now,
    };
    transaction.update(downloadRequestRef, newRequest);
    return true;
  }

  let didClaim: bool;
  try {
    didClaim = await FirebaseAdmin.firestore().runTransaction(
      transactionOperation,
    );
  } catch (error) {
    const errorCode = error.code || 'infindi/server-error';
    const errorMessage = error.toString();
    throw { errorCode, errorMessage };
  }
  return didClaim;
}

async function genCredentials(credentialsID: ID): Promise<?PlaidCredentials> {
  // TODO: Flow typing.
  let document;
  try {
    document = await FirebaseAdmin.firestore()
      .collection('PlaidCredentials')
      .doc(credentialsID)
      .get();
  } catch (error) {
    const errorCode = error.code || 'infindi/server-error';
    const errorMessage = error.toString();
    throw { errorCode, errorMessage };
  }
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

  try {
    await FirebaseAdmin.firestore()
      .collection('Accounts')
      .doc(id)
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
  try {
    await FirebaseAdmin.firestore()
      .collection('Transactions')
      .doc(transaction.id)
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
