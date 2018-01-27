/* @flow */

import express from 'express';

import { getWorkerID } from '../workers';

const router = express.Router();

export default router;

export function initialize(): void {
  router.get('/status', (req, res) => {
    res.json({
      workerID: getWorkerID(),
    });
  });

  router.get('/worker/status', (req, res) => {
    res.json({
      workerID: getWorkerID(),
    });
  });
}
