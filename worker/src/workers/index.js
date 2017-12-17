/* @flow */

import uuid from 'uuid/v4';

import { initialize as initializeCoreMetrics } from './core-metrics';
import { initialize as initializeDownloadRequests } from './download-requests';
import { initialize as initializePing } from './ping';
import { initialize as initializeUpdateAccount } from './update-account';

import type { ID } from 'common/src/types/core';

let workerID: ?ID = null;

export function initialize(): void {
  workerID = uuid();

  initializeCoreMetrics(workerID);
  initializeDownloadRequests(workerID);
  initializePing(workerID);
  initializeUpdateAccount(workerID);
}

export function getWorkerID(): ?ID {
  return workerID;
}
