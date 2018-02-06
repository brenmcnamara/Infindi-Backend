/* @flow */

import express from 'express';

import { INFO } from '../log-utils';

import type { RouteHandler } from '../middleware';

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
    res.json({ data: { status: 'okay' } });
  };
}

router.post('/ping', performPing());

// -----------------------------------------------------------------------------
//
// jobs/update-accounts
//
// -----------------------------------------------------------------------------
