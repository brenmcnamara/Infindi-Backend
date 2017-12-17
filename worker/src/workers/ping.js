/* @flow */

import CommonBackend from 'common-backend';

import { INFO } from '../log-utils';

export function initialize(workerID: string): void {
  INFO('INITIALIZATION', 'Initializing ping worker');
  CommonBackend.Job.listenToJobRequest('PING', workerID, genOnPing);
}

function genOnPing() {
  INFO('LITMUS', 'Received ping');
  return Promise.resolve();
}
