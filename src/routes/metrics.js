/* @flow */

import BackendAPI from 'common-backend';

import express from 'express';

import { checkAuth } from '../middleware';
import { getStatusForErrorCode } from 'common/lib/error-utils';

import type { Pointer } from 'common/types/core';
import type { RouteHandler } from '../middleware';

const router = express.Router();

export default router;

const Job = BackendAPI.Job;

export function initialize(): void {}

// -----------------------------------------------------------------------------
//
// POST metrics/calculate
//
// -----------------------------------------------------------------------------

function performCalculateMetrics(): RouteHandler {
  return async (req, res) => {
    const { uid } = req.decodedIDToken;

    const payload = { userID: uid };
    let pointer: Pointer<'JobRequest'>;
    try {
      pointer = await Job.genRequestJob('CALCULATE_CORE_METRICS', payload);
    } catch (error) {
      const status = getStatusForErrorCode(error.errorCode);
      res.status(status).json(error);
    }
    res.json({ data: pointer });
  };
}

router.post('/calculate', checkAuth());
router.post('/calculate', performCalculateMetrics());
