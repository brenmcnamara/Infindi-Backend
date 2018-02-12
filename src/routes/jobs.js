/* @flow */

import express from 'express';
import invariant from 'invariant';

import { createJob, genCreateJob } from 'common/lib/models/Job';
import {
  createRefreshSchedule,
  genFetchRefreshInfoForUser,
} from 'common/lib/models/RefreshInfo';
import { DEBUG, INFO } from '../log-utils';
import {
  genCheckAndRefreshYodleeUserSession,
  getYodleeClient,
} from '../yodlee-manager';
import { genUpdateAccounts } from '../operations/yodlee';
import { handleError } from '../route-utils';

import type { JobSchedule } from 'common/lib/models/Job';
import type { RouteHandler } from '../middleware';

const JOB_SUCCESS_RESPONSE = { data: { status: 'okay' } };

export function initialize(): void {}

const router = express.Router();

export default router;

// -----------------------------------------------------------------------------
//
// jobs/ping
//
// -----------------------------------------------------------------------------

function performPing(): RouteHandler {
  return (req, res) => {
    INFO('JOBS', 'Ping');
    res.json(JOB_SUCCESS_RESPONSE);
  };
}

router.post('/ping', performPing());

// -----------------------------------------------------------------------------
//
// jobs/update-accounts
//
// -----------------------------------------------------------------------------

function validateUpdateAccounts(): RouteHandler {
  return handleError((req, res, next) => {
    DEBUG('YODLEE', 'Validating accounts');
    const body = req.body;
    if (!body || !body.userID || typeof body.userID !== 'string') {
      const errorCode = 'infindi/bad-request';
      const errorMessage = 'userID of type string must be provided';
      const toString = () => `[${errorCode}]: ${errorMessage}`;
      throw {
        errorCode,
        errorMessage,
        toString,
      };
    }
    next();
  });
}

function performUpdateAccounts(): RouteHandler {
  return handleError(async (req, res) => {
    const userID = req.body.userID;
    const yodleeUserSession = await genCheckAndRefreshYodleeUserSession(userID);
    const yodleeClient = getYodleeClient();

    INFO('YODLEE', `Updating accounts for user: ${userID}`);
    await genUpdateAccounts(yodleeUserSession, yodleeClient, userID);

    const refreshes = await genFetchRefreshInfoForUser(userID);
    const schedules = refreshes.map(refresh => createRefreshSchedule(refresh));

    const now = new Date();
    const nextRefreshSchedule: JobSchedule | null = schedules.reduce(
      (next, schedule) => {
        invariant(
          schedule.recurringType === 'ONCE',
          'Only supports schedules of type ONCE',
        );
        const { runAt } = schedule;
        // $FlowFixMe - This is fine.
        const nextRunAt: Date | null = next && next.runAt;
        return now.getTime() > runAt.getTime() ||
          (nextRunAt && nextRunAt.getTime() > runAt.getTime())
          ? next
          : schedule;
      },
      null,
    );

    if (nextRefreshSchedule) {
      INFO('YODLEE', `Scheduling another refresh for user ${userID}`);
      const job = createJob(
        '/update-accounts',
        { userID },
        nextRefreshSchedule,
      );
      await genCreateJob(job);
    }

    res.json(JOB_SUCCESS_RESPONSE);
  }, true);
}

router.post('/update-accounts', validateUpdateAccounts());
router.post('/update-accounts', performUpdateAccounts());
