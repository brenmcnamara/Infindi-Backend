/* @flow */

import auth, { initialize as initializeAuth } from './auth';
import debug, { initialize as initializeDebug } from './debug';
import express from 'express';
import jobs, { initialize as initializeJobs } from './jobs';
import yodlee, { initialize as initializeYodlee } from './yodlee';

const router = express.Router();

export default router;

export function initialize(): void {
  initializeAuth();
  initializeDebug();
  initializeJobs();
  initializeYodlee();

  router.get('/status', (req, res) => {
    res.json({ status: 'OK' });
  });
  router.get('/_ah/health', (req, res) => {
    res.json({ status: 'OK' });
  });

  router.use('/auth', auth);
  router.use('/yodlee', yodlee);
  router.use('/jobs', jobs);

  if (process.env.INCLUDE_DEBUG_ROUTES === 'true') {
    router.use('/debug', debug);
  }
}
