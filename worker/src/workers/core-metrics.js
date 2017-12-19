/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import CommonBackend from 'common-backend';

import genNetWorth from '../calculations/genNetWorth';
import genSavingsRate from '../calculations/genSavingsRate';

import { INFO } from '../log-utils';

import type { ID } from 'common/src/types/core';
import type { UserMetrics } from 'common/src/types/db';

const { DB } = CommonBackend;

export function initialize(workerID: ID): void {
  INFO('INITIALIZATION', 'Initializing core-metrics worker');

  CommonBackend.Job.listenToJobRequest(
    'CALCULATE_CORE_METRICS',
    workerID,
    genCalculateCoreMetrics,
  );
}

async function genCalculateCoreMetrics(payload: Object) {
  INFO('METRICS', 'Updating core metrics for user');
  const { userID } = payload;
  const [netWorth, savingsRate] = await Promise.all([
    genNetWorth(userID),
    genSavingsRate(userID),
  ]);

  const userMetrics = await genUserMetrics(userID);

  const now = new Date();
  const newUserMetrics = {
    createdAt: userMetrics ? userMetrics.createdAt : now,
    id: userID,
    modelType: 'UserMetrics',
    netWorth,
    savingsRate,
    type: 'MODEL',
    updatedAt: now,
  };

  INFO('METRICS', 'Generates new core metrics for user');
  await FirebaseAdmin.firestore()
    .collection('UserMetrics')
    .doc(userID)
    .set(newUserMetrics);
  INFO('METRICS', 'Finished writing new core metrics for user');
}

async function genUserMetrics(userID: ID): Promise<?UserMetrics> {
  const document = await DB.transformError(
    FirebaseAdmin.firestore()
      .collection('UserMetrics')
      .doc(userID)
      .get(),
  );

  if (!document.exists) {
    return null;
  }
  return document.data();
}
