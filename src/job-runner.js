/* @flow */

import FirebaseAdmin from 'firebase-admin';
import UserInfo from 'common/lib/models/UserInfo';

import invariant from 'invariant';
import uuid from 'uuid/v4';

import { ERROR, INFO } from './log-utils';
import { genYodleeRefreshAccountLinksForUser } from './operations/account-link/refresh';

import type { ModelStub } from 'common/types/core';

const MILLIS_PER_DAY = 1000 * 60 * 60 * 24;

type Job = {
  genRun: () => Promise<void>,
  name: string,
  nextJobRunAt: () => Date,
};

const timers: { [jobName: string]: TimeoutID } = {};

export function initialize(): void {
  INFO('JOB-RUNNER', 'Initializing job runner');
  jobs.forEach(job => {
    scheduleJob(job);
  });
}

const jobs: Array<Job> = [
  {
    genRun: async () => {
      const users = await genFetchAllUsers();
      await Promise.all(
        users.map(user => genYodleeRefreshAccountLinksForUser(user.id)),
      );
    },

    name: 'RefreshAllAccounts',

    nextJobRunAt: () => {
      // Running this job at 6PM everyday
      return runAtPTCTime(6 + 12, 0);
    },
  },
];

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

type JobRun = ModelStub<'JobRun'> & {
  endedAt: Date | null,
  errorMessage: string | null,
  name: string,
  startedAt: Date,
  status: 'SUCCESS' | 'FAILURE' | 'RUNNING',
};

async function genRunJob(job: Job): Promise<void> {
  INFO('JOB-RUNNER', `Starting job: ${job.name}`);
  delete timers[job.name];

  // STEP 1: CREATE THE JOB RUN AND SAVE IT TO FIREBASE.
  const nowBeforeJobRun = new Date();
  const jobRun: JobRun = {
    createdAt: nowBeforeJobRun,
    endedAt: null,
    errorMessage: null,
    id: uuid(),
    modelType: 'JobRun',
    name: job.name,
    startedAt: nowBeforeJobRun,
    status: 'RUNNING',
    type: 'MODEL',
    updatedAt: nowBeforeJobRun,
  };
  await FirebaseAdmin.firestore()
    .collection('JobRuns')
    .doc(jobRun.id)
    .set(jobRun);

  // STEP 2: RUN THE JOB.
  let errorMessage = null;
  let status = 'SUCCESS';
  try {
    await job.genRun();
  } catch (error) {
    errorMessage =
      error.errorMessage ||
      error.message ||
      error.error_message ||
      error.toString();
    status = 'FAILURE';
    ERROR('JOB-RUNNER', `Job failed: ${job.name}. id: ${jobRun.id}`);
  }

  // STEP 3: SEND THE RESULTS OF THE JOB RUN TO FIREBASE.
  const nowAfterJobRun = new Date();
  const newJobRun = {
    ...jobRun,
    endedAt: nowAfterJobRun,
    errorMessage,
    nowAfterJobRun,
    status,
    updatedAt: nowAfterJobRun,
  };

  await FirebaseAdmin.firestore()
    .collection('JobRuns')
    .doc(newJobRun.id)
    .set(newJobRun);

  // STEP 4: SCHEDULE THE NEXT JOB RUN.
  scheduleJob(job);

  INFO('JOB-RUNNER', `Done running job: ${job.name}`);
}

function scheduleJob(job: Job): void {
  invariant(!timers[job.name], 'Cannot schedule a job more than once');

  const nowMillis = Date.now();
  const jobRunAtMillis = job.nextJobRunAt().getTime();
  invariant(
    jobRunAtMillis >= nowMillis,
    'Trying to schedule a job in the past',
  );

  timers[job.name] = setTimeout(() => {
    genRunJob(job);
  }, jobRunAtMillis - nowMillis);
}

async function genFetchAllUsers(): Promise<Array<UserInfo>> {
  const snapshot = await UserInfo.FirebaseCollectionUNSAFE.get();
  return snapshot.docs
    .filter(doc => doc.exists)
    .map(doc => UserInfo.fromRaw(doc.data()));
}

function runAtPTCTime(hour: number, minute: number) {
  const MILLIS_PER_MINUTE = 1000 * 60;
  const MILLIS_PER_HOUR = MILLIS_PER_MINUTE * 60;

  const nowMillis = Date.now();
  const startOfDayMillis = nowMillis - nowMillis % MILLIS_PER_DAY;
  const runTimeMillis =
    startOfDayMillis +
    (hour + 7) * MILLIS_PER_HOUR +
    minute * MILLIS_PER_MINUTE;

  // Could be that after adding 7 hours for timezone to UTC, we spill over to
  // the next day. Make sure we are not getting the time for the next day.
  // Adding 10 milliseconds so that by the time the job is scheduled, it does
  // not get scheduled in the past by accident.
  return new Date(
    runTimeMillis + 50 - nowMillis >= MILLIS_PER_DAY
      ? runTimeMillis - MILLIS_PER_DAY
      : runTimeMillis,
  );
}
