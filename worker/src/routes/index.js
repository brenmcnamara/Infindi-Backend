/* @flow */

import express from 'express';

import session, { initialize as initializeSession } from './session';

import { getWorkerID } from '../workers';

const router = express.Router();

export default router;

export function initialize(): void {
  initializeSession();

  router.get('/status', (req, res) => {
    res.json({
      workerID: getWorkerID(),
    });
  });

  router.use('/session', session);
}
