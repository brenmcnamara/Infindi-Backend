/* @flow */

import express from 'express';

import { getWorkerID } from '../workers';

const router = express.Router();

export default router;

router.get('/status', (req, res) => {
  res.json({
    workerID: getWorkerID(),
  });
});
