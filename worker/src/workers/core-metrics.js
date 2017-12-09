/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import BackendAPI from 'common-backend';

import genNetWorth from '../calculations/genNetWorth';
import genSavingsRate from '../calculations/genSavingsRate';

import type { ID } from 'common/src/types/core';
import type { UserMetrics } from 'common/src/types/db';

const DB = BackendAPI.DB;

let workerID: ?ID = null;

export function initialize(_workerID: ID): void {
  workerID = _workerID;

  BackendAPI.Job.listenToJobRequest(
    'CALCULATE_CORE_METRICS',
    workerID,
    genCalculateCoreMetrics,
  );
}

async function genCalculateCoreMetrics(payload: Object) {
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

  await FirebaseAdmin.firestore()
    .collection('UserMetrics')
    .doc(userID)
    .set(newUserMetrics);
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
