/* @flow */

import auth, { initialize as initializeAuth } from './auth';
import express from 'express';
import metrics, { initialize as initializeMetrics } from './metrics';
import plaid, { initialize as initializePlaid } from './plaid';
import debug, { initialize as initializeDebug } from './debug';

const router = express.Router();

export default router;

export function initialize(): void {
  initializeAuth();
  initializeMetrics();
  initializePlaid();
  initializeDebug();

  router.use('/auth', auth);
  router.use('/metrics', metrics);
  router.use('/plaid', plaid);

  if (process.env.INCLUDE_DEBUG_ROUTES === 'true') {
    router.use('/debug', debug);
  }
}
