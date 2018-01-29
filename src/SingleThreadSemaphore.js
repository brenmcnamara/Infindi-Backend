/* @flow */

import invariant from 'invariant';
import uuid from 'uuid/v4';

import type { ID } from 'common/types/core';

export type Semaphore = ID;

type SemaphorePayload = {|
  +id: ID,
  +pendingRequestPayloads: Array<RequestPayload>,
  +numAvailable: number,
  +runningRequests: Array<ID>,
|};

type RequestPayload = {|
  +requestID: ID,
  +resolve: ID => any,
|};

const semaphorePayloads: { [id: ID]: SemaphorePayload } = {};

export function createSemaphore(numAvailable: number): Semaphore {
  const semaphore = uuid();
  semaphorePayloads[semaphore] = {
    id: semaphore,
    pendingRequestPayloads: [],
    numAvailable,
    runningRequests: [],
  };
  return semaphore;
}

export function deleteSemaphore(semaphore: Semaphore): void {
  const payload = semaphorePayloads[semaphore];
  invariant(payload, 'Cannot delete a semaphore that does not exist');
  invariant(
    payload.runningRequests.length === 0,
    'Cannot delete a semaphore with running requests',
  );
  delete semaphorePayloads[semaphore];
}

export function requestSemaphore(semaphore: Semaphore): Promise<ID> {
  const requestID = uuid();
  const payload = semaphorePayloads[semaphore];
  invariant(payload, 'Cannot request a semaphore that does not exist');
  const { numAvailable, pendingRequestPayloads, runningRequests } = payload;
  if (runningRequests.length < numAvailable) {
    runningRequests.push(requestID);
    return Promise.resolve(requestID);
  }
  return new Promise(resolve => {
    pendingRequestPayloads.push({ requestID, resolve });
  });
}

export function releaseSemaphore(
  semaphore: Semaphore,
  requestID: ID,
): Promise<void> {
  const payload = semaphorePayloads[semaphore];
  invariant(payload, 'Cannot release a semaphore that does not exist');
  const { pendingRequestPayloads, runningRequests } = payload;
  const index = runningRequests.indexOf(requestID);
  invariant(index >= 0, 'Trying to release semaphore that is not posessed');
  const requestPayload = pendingRequestPayloads.shift();
  runningRequests.splice(index, 1);
  if (requestPayload) {
    runningRequests.push(requestPayload.requestID);
    requestPayload.resolve(requestPayload.requestID);
  }
  return Promise.resolve();
}
