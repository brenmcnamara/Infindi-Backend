/* @flow */

import express from 'express';

const router = express.Router();

router.get('/plaid', (req, res) => {
  res.render('plaid');
});

export default router;

export function initialize(): void {}
