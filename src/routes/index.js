/* @flow */

import debug, { initialize as initializeDebug } from './debug';
import express from 'express';
import users, { initialize as initializeUsers } from './users';
import yodlee, { initialize as initializeYodlee } from './yodlee';

const router = express.Router();

export default router;

export function initialize(): void {
  initializeDebug();
  initializeUsers();
  initializeYodlee();

  // $FlowFixMe - Look into this later.
  router.get('/status', (req, res) => {
    res.json({ status: 'OK' });
  });

  // $FlowFixMe - Look into this later.
  router.get('/_ah/health', (req, res) => {
    res.json({ status: 'OK' });
  });

  router.use('/users', users);
  router.use('/yodlee', yodlee);

  if (process.env.INCLUDE_DEBUG_ROUTES === 'true') {
    router.use('/debug', debug);
  }
}
