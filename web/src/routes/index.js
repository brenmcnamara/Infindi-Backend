/* @flow */

import auth, { initialize as initializeAuth } from './auth';
import express from 'express';
import metrics, { initialize as initializeMetrics } from './metrics';
import plaid, { initialize as initializePlaid } from './plaid';
import debug, { initialize as initializeDebug } from './debug';
import session, { initialize as initializeSession } from './session';
import update, { initialize as initializeUpdate } from './update';
import yodlee, { initialize as initializeYodlee } from './yodlee';

const router = express.Router();

export default router;

export function initialize(): void {
  initializeAuth();
  initializeDebug();
  initializeMetrics();
  initializePlaid();
  initializeSession();
  initializeUpdate();
  initializeYodlee();

  router.get('/status', (req, res) => {
    res.json({ status: 'OK' });
  });
  router.get('/_ah/health', (req, res) => {
    res.json({ status: 'OK' });
  });

  router.use('/auth', auth);
  router.use('/metrics', metrics);
  router.use('/plaid', plaid);
  router.use('/session', session);
  router.use('/update', update);
  router.use('/yodlee', yodlee);

  if (process.env.INCLUDE_DEBUG_ROUTES === 'true') {
    router.use('/debug', debug);
  }
}
