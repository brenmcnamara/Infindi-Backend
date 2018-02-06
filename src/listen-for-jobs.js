/* @flow */

import invariant from 'invariant';
import request from 'request';

import { ERROR, INFO } from './log-utils';
import { isExpired, listenForJobs } from 'common/lib/models/Job';

import type { ID } from 'common/types/core';
import type { Job, JobSchedule, Subscription } from 'common/lib/models/Job';

const jobCollection: { [id: ID]: Job } = {};
const jobSubscriptions: { [id: ID]: Subscription } = {};

export function initialize(): void {
  listenForJobs(onNewJobs);
}

function onNewJobs(jobs: Array<Job>): void {
  INFO('JOB-RUNNER', `Receiving ${jobs.length} new jobs(s)`);

  const modifiedJobs = jobs.filter(
    job =>
      !isExpired(job) &&
      jobCollection[job.id] &&
      isLegalJobChange(jobCollection[job.id], job),
  );
  const newJobs = jobs.filter(job => !isExpired(job) && !jobCollection[job.id]);
  const corruptJobs = jobs.filter(
    job =>
      !isExpired(job) &&
      jobCollection[job.id] &&
      !isLegalJobChange(jobCollection[job.id], job),
  );

  corruptJobs.forEach(job => {
    ERROR('JOB-RUNNER', `Job ${job.id} has been corrupted`);
  });

  INFO(
    'JOB-RUNNER',
    `${newJobs.length} new job(s). ${modifiedJobs.length} modified job(s).`,
  );
  modifiedJobs.forEach(job => (jobCollection[job.id] = job));
  newJobs.forEach(job => {
    jobCollection[job.id] = job;
    const subscription = scheduleJob(job.id, job.schedule);
    jobSubscriptions[job.id] = subscription;
  });
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
    originalSchedule.type === 'ONCE',
    'Only support jobs with schedule type ONCE',
  );
  const originalRunAt = originalSchedule.runAt;
  invariant(
    modifiedSchedule.type === 'ONCE',
    'Only support jobs with schedule type ONCE',
  );
  const modifiedRunAt = modifiedSchedule.runAt;
  return (
    originalJob.endpoint === originalJob.endpoint &&
    originalRunAt.getTime() === modifiedRunAt.getTime()
  );
}

function scheduleJob(jobID: ID, schedule: JobSchedule): Subscription {
  invariant(
    !jobSubscriptions[jobID],
    'Trying to schedule a job that is already scheduled',
  );
  invariant(
    jobCollection[jobID],
    'Trying to schedule a job that cannot be found',
  );
  invariant(
    !isExpired(jobCollection[jobID]),
    'Trying to schedule a job that is expired',
  );
  invariant(
    schedule.type === 'ONCE',
    'Scheduling jobs only supports schedule type ONCE',
  );
  const runAtMillis = schedule.runAt;
  const nowMillis = Date.now();
  const timeout = setTimeout(() => {
    INFO('JOB-RUNNER', 'Executing job');
    const job = jobCollection[jobID];
    invariant(job, 'Trying to run a job that cannot be found');
    // TODO: Should I add job statuses for when jobs complete. Don't need
    // this at the moment, may need it later.
    genRunJob(job).catch(error => {
      ERROR('JOB-RUNNER', `Error when executing job: ${error.toString()}`);
    });
    delete jobSubscriptions[jobID];
  }, runAtMillis - nowMillis);
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
