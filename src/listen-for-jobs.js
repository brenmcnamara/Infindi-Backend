/* @flow */

import invariant from 'invariant';
import request from 'request';

import { ERROR, INFO } from './log-utils';
import {
  listenForJobs,
  updateJobStatus,
  genUpdateJob,
  getTimeTillRunMillis,
} from 'common/lib/models/Job';

import type { ID } from 'common/types/core';
import type { Job, Subscription } from 'common/lib/models/Job';

const jobCollection: { [id: ID]: Job } = {};
const jobSubscriptions: { [id: ID]: Subscription } = {};

export function initialize(): void {
  listenForJobs(onNewJobs);
}

function onNewJobs(jobs: Array<Job>): void {
  INFO('JOB-RUNNER', `Receiving ${jobs.length} new jobs(s)`);

  let newJobsCount = 0;
  let modifiedJobsCount = 0;

  for (const job of jobs) {
    // Note that while we are running jobs and updating their statuses, we
    // will get updates of those jobs here. Jobs that are running already cannot
    // start running, we will ignore them.
    const canRun = getTimeTillRunMillis(job) !== null;
    if (!canRun) {
      continue;
    }

    const doesExist = Boolean(jobCollection[job.id]);
    if (doesExist) {
      if (isLegalJobChange(jobCollection[job.id], job)) {
        ++modifiedJobsCount;
      } else {
        ERROR('JOB-RUNNER', `Job ${job.id} has been corrupted`);
      }
    } else {
      const subscription = scheduleJob(job);
      jobCollection[job.id] = job;
      jobSubscriptions[job.id] = subscription;
      ++newJobsCount;
    }
  }

  INFO(
    'JOB-RUNNER',
    `${newJobsCount} new job(s). ${modifiedJobsCount} modified job(s).`,
  );
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

/**
 * An illegal job modification is a change to the structure of the job that
 * is not handled by the job runner.
 */
function isLegalJobChange(originalJob: Job, modifiedJob): bool {
  const originalSchedule = originalJob.schedule;
  const modifiedSchedule = modifiedJob.schedule;
  invariant(
    originalSchedule.recurringType === 'ONCE',
    'Only support jobs with schedule type ONCE',
  );
  const originalRunAt = originalSchedule.runAt;
  invariant(
    modifiedSchedule.recurringType === 'ONCE',
    'Only support jobs with schedule type ONCE',
  );
  const modifiedRunAt = modifiedSchedule.runAt;
  return (
    originalJob.endpoint === originalJob.endpoint &&
    originalRunAt.getTime() === modifiedRunAt.getTime()
  );
}

function scheduleJob(job: Job): Subscription {
  invariant(
    !jobSubscriptions[job.id],
    'Trying to schedule a job that is already scheduled',
  );
  const timeTillRunMillis = getTimeTillRunMillis(job);
  const timeout = setTimeout(async () => {
    INFO('JOB-RUNNER', 'Executing job');
    let updatedJob = jobCollection[job.id];
    invariant(updatedJob, 'Trying to run a job that cannot be found');
    updatedJob = updateJobStatus(updatedJob, 'RUNNING');
    jobCollection[updatedJob.id] = updatedJob;
    await genUpdateJob(updatedJob);
    try {
      await genRunJob(updatedJob);
    } catch (error) {
      ERROR('JOB-RUNNER', `Error when executing job: ${error.toString()}`);
      updatedJob = updateJobStatus(updatedJob, 'FAILURE');
      jobCollection[updatedJob.id] = updatedJob;
      await genUpdateJob(updatedJob);
      delete jobSubscriptions[updatedJob.id];
      return;
    }
    updatedJob = updateJobStatus(updatedJob, 'SUCCESS');
    jobCollection[updatedJob.id] = updatedJob;
    await genUpdateJob(updatedJob);
    delete jobSubscriptions[updatedJob.id];
  }, timeTillRunMillis);
  return {
    remove: () => clearTimeout(timeout),
  };
}

function genRunJob(job: Job): Promise<void> {
  return new Promise((resolve, reject) => {
    const { JOBS_DOMAIN } = process.env;
    invariant(JOBS_DOMAIN, 'JOBS_DOMAIN environment variable not defined');
    const { body, endpoint } = job;
    const options = {
      // TODO: Need to add authorization header to jobs.
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify(body),
      uri: `${JOBS_DOMAIN}${endpoint}`,
    };

    const onComplete = (error: Error, response: Object, body: string) => {
      if (error) {
        reject(error);
        return;
      }
      const json = JSON.parse(body);
      if (json.errorCode) {
        reject(json);
        return;
      }
      resolve();
    };

    request(options, onComplete);
  });
}
