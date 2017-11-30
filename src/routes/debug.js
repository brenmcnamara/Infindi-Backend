/* @flow */

import express from 'express';

const router = express.Router();

export default router;

export function initialize(): void {
  router.get('/plaid', (req, res) => {
    res.render('plaid');
  });
}
