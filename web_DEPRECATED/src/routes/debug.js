/* @flow */

import express from 'express';

const router = express.Router();

export default router;

export function initialize(): void {
  router.get('/plaid', (req, res) => {
    res.render('plaid');
  });

  router.get('/security-checks', (req, res) => {
    res.render('security-checks', {
      AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
      DB_URL: process.env.FIREBASE_DB_URL,
      PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
      STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
      TEST_EMAIL: process.env.FIREBASE_TEST_USER_EMAIL,
      TEST_PASSWORD: process.env.FIREBASE_TEST_USER_PASSWORD,
      WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
    });
  });
}
