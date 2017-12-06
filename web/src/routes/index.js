/* @flow */

import auth, { initialize as initializeAuth } from './auth';
import express from 'express';
import plaid, { initialize as initializePlaid } from './plaid';
import debug, { initialize as initializeDebug } from './debug';

const router = express.Router();

export default router;

export function initialize(): void {
  initializeAuth();
  initializePlaid();
  initializeDebug();

  router.use('/auth', auth);
  router.use('/plaid', plaid);

  if (process.env.INCLUDE_DEBUG_ROUTES === 'true') {
    router.use('/debug', debug);
  }
}
