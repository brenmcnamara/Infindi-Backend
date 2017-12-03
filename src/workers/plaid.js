/* @flow */

import * as FirebaseAdmin from 'firebase-admin';

import invariant from 'invariant';
import uuid from 'uuid/v4';

import { type Firebase$DataSnapshot } from '../types/firebase';
import { type ID, type Seconds } from '../types/core';
import { type PlaidDownloadRequest } from '../types/db';

type DownloadRequestSnapshot = Firebase$DataSnapshot<PlaidDownloadRequest>;

const ABORT_TRANSACTION = undefined;

let workerID: ?ID = null;

const CLAIM_MAX_TIMEOUT: Seconds = 60;

export function initialize(): void {
  workerID = uuid();

  const downloadRequestsRef = FirebaseAdmin.database().ref(
    'PlaidDownloadRequests',
  );

  downloadRequestsRef.on('child_changed', onChangeDownloadRequest);
  downloadRequestsRef.on('child_added', onAddDownloadRequest);
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

async function onChangeDownloadRequest(snapshot: DownloadRequestSnapshot) {
  const request = snapshot.val();
  if (!request) {
    return;
  }
  if (request.status.type !== 'NOT_INITIALIZED') {
    return;
  }
  const isClaimed = await genAttemptRequestClaim(request);
  if (!isClaimed) {
    return;
  }
}

async function onAddDownloadRequest(snapshot: DownloadRequestSnapshot) {
  const request = snapshot.val();
  if (!request) {
    return;
  }
  if (request.status.type !== 'NOT_INITIALIZED') {
    return;
  }
  const isClaimed = await genAttemptRequestClaim(request);
  if (!isClaimed) {
    return;
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
