/* @flow */

import DB from './data-api';

import invariant from 'invariant';
import uuid from 'uuid/v4';

import type { Document, Snapshot, Transaction } from './data-api';
import type { ID, Pointer } from 'common/src/types/core';
import type { JobRequest } from 'common/src/types/db';

let FirebaseAdmin: ?Object = null;

const runningRequests = {};

function initialize(admin: Object): void {
  FirebaseAdmin = admin;
}

/**
 * Request a job to be executed the next moment a worker instance is available.
 */
async function genRequestJob(
  name: string,
  payload: Object,
): Promise<Pointer<'JobRequest'>> {
  const id: ID = uuid();
  const now = new Date();
  const jobRequest: JobRequest = {
    completionTime: null,
    createdAt: now,
    errorCode: null,
    id,
    modelType: 'JobRequest',
    name,
    payload,
    status: 'UNCLAIMED',
    timeout: 60,
    type: 'MODEL',
    updatedAt: now,
    workerID: null,
  };
  await DB.transformError(
    getDatabase()
      .collection('JobRequests')
      .doc(id)
      .set(jobRequest),
  );
  return {
    pointerType: 'JobRequest',
    refID: id,
    type: 'POINTER',
  };
}

/**
 * Manages the basic lifecycle of a job request. Listen for requests coming in,
 * do the work in "onJobRequest", and return a promise when the job is complete.
 */
function listenToJobRequest(
  jobName: string,
  workerID: ID,
  onJobRequest: (payload: Object) => Promise<void>,
) {
  const Database = getDatabase();
  Database.collection('JobRequests')
    .where('name', '==', jobName)
    .where('status', '==', 'UNCLAIMED')
    .onSnapshot(onIncomingJob);

  async function onIncomingJob(snapshot: Snapshot<JobRequest>) {
    const requests: Array<JobRequest> = snapshot.docs
      .filter(doc => doc.exists)
      .map(doc => doc.data());

    const genClaims = requests.map(request =>
      DB.transformError(genAttemptClaimJobRequest(request, workerID)),
    );

    const claims = await Promise.all(genClaims);
    const claimedRequests = requests.filter(
      (request, index) => claims[index] && !runningRequests[request.id],
    );

    for (let request of claimedRequests) {
      runningRequests[request.id] = true;

      const startTime = Date.now();
      Database.collection('JobRequests')
        .doc(request.id)
        .get()
        .then(document => document.data())
        .then((request: JobRequest) =>
          onJobRequest(request.payload).then(() => request),
        )
        .then((request: JobRequest) => {
          delete runningRequests[request.id];
          const endTime = Date.now();
          const completionTime = Math.floor((endTime - startTime) / 1000);
          const now = new Date();
          return DB.transformError(
            Database.collection('JobRequests')
              .doc(request.id)
              .set({
                ...request,
                completionTime,
                status: 'COMPLETE',
                updatedAt: now,
              }),
          );
        })
        .catch(error => {
          delete runningRequests[request.id];
          const now = new Date();
          return DB.transformError(
            Database.collection('JobRequests')
              .doc(request.id)
              .set({
                ...request,
                error: error.errorCode,
                status: 'FAILED',
                updatedAt: now,
              }),
          );
        });
    }
  }
}

async function genAttemptClaimJobRequest(
  jobRequest: JobRequest,
  workerID: ID,
): Promise<boolean> {
  invariant(
    jobRequest.status === 'UNCLAIMED',
    'Trying to claim job request that is known to not be claimable',
  );
  const Database = getDatabase();

  const requestRef = Database.collection('JobRequests').doc(jobRequest.id);

  async function transactionOperation(transaction: Transaction) {
    const document = await transaction.get(requestRef);
    if (!document.exists) {
      return;
    }

    const request: JobRequest = document.data();

    if (request.status !== 'UNCLAIMED') {
      return;
    }

    const now = new Date();
    const newRequest = {
      ...request,
      status: 'RUNNING',
      updatedAt: now,
      workerID,
    };

    transaction.update(requestRef, newRequest);
  }

  await Database.runTransaction(transactionOperation);
  const document = await DB.transformError(
    DB.throwIfDocDoesNotExist(requestRef.get()),
  );
  const newRequest: JobRequest = document.data();
  return newRequest.status === 'RUNNING' && newRequest.workerID === workerID;
}

export default {
  genRequestJob,
  initialize,
  listenToJobRequest,
};

// -----------------------------------------------------------------------------
//
// UTILITY
//
// -----------------------------------------------------------------------------

function getDatabase() {
  invariant(FirebaseAdmin, 'job-api not initialized on time');
  return FirebaseAdmin.firestore();
}
