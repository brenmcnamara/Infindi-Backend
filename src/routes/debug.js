/* @flow */

import express from 'express';

const router = express.Router();

export default router;

export function initialize(): void {
  router.get('/plaid', (req, res) => {
    res.render('plaid');
  });

  router.get('/login', (req, res) => {
    res.render('firebase-login', {
      API_KEY: process.env.FIREBASE_WEB_API_KEY,
      AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
      DB_URL: process.env.FIREBASE_DB_URL,
      STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    });
  });
}
