/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Plaid from 'plaid';

import invariant from 'invariant';
import uuid from 'uuid/v4';

import {
  type Account,
  type PlaidCredentials,
  type PlaidDownloadRequest,
} from '../types/db';
import { type Account as Plaid$Account } from '../types/plaid';
import { type Firebase$DataSnapshot } from '../types/firebase';
import { type ID, type Seconds } from '../types/core';

type DownloadRequestSnapshot = Firebase$DataSnapshot<PlaidDownloadRequest>;

const ABORT_TRANSACTION = undefined;
const CLAIM_MAX_TIMEOUT: Seconds = 60;

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
    await genDownloadRequest(request);
  } catch (error /* InfindiError */) {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    await FirebaseAdmin.database()
      .ref(`PlaidDownloadRequests/${request.id}`)
      .set({
        ...request,
        status: {
          errorCode: error.errorCode,
          errorMessage: error.errorMessage,
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

async function genDownloadRequest(request: PlaidDownloadRequest) {
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
  const plaidAccounts = await genPlaidAccounts(
    plaidClient,
    credentials.accessToken,
  );
  const accounts = await Promise.all(plaidAccounts.map(genCreateAccount));

  // TODO: For each user account, download the transactions for the last 2
  // years
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
      refID: id,
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
