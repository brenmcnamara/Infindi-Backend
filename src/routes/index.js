/* @flow */

import auth, { initialize as initializeAuth } from './auth';
import express from 'express';
import plaid, { initialize as initializePlaid } from './plaid';
import ui, { initialize as initializeUI } from './ui';

const router = express.Router();

router.use('/auth', auth);
router.use('/plaid', plaid);
router.use('/ui', ui);

export default router;

export function initialize(): void {
  initializeAuth();
  initializePlaid();
  initializeUI();
}
