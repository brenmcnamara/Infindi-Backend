/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Plaid from 'plaid';

import express from 'express';

import { checkAuth, type RouteHandler } from '../middleware';
import { getStatusForErrorCode } from '../error-codes';

const router = express.Router();

export default router;

let plaidClient;

export function initialize(): void {
  plaidClient = new Plaid.Client(
    process.env.PLAID_CLIENT_ID,
    process.env.PLAID_SECRET,
    process.env.PLAID_PUBLIC_KEY,
    Plaid.environments[process.env.PLAID_ENV],
  );
}

function checkPlaidClientInitialized(): RouteHandler {
  return (req, res, next) => {
    if (!plaidClient) {
      const errorCode = 'infind/server-error';
      const errorMessage = 'Plaid client not initialized';
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }
    next();
  };
}

// -----------------------------------------------------------------------------
//
// POST plaid/credentials
//
// -----------------------------------------------------------------------------

function validateCredentials(): RouteHandler {
  return (req, res, next) => {
    const { body } = req;
    if (typeof body.publicToken !== 'string') {
      res.status(400).json({
        errorCode: 'infindi/bad-request',
        errorMessage: 'request requires param: "publicToken"',
      });
      return;
    }
    next();
  };
}

function performCredentials(): RouteHandler {
  return (req, res) => {
    const publicToken = req.body.publicToken;
    const metadata = req.body.metadata || {};

    plaidClient.exchangePublicToken(publicToken, async (error, response) => {
      if (error !== null) {
        const errorCode = 'infindi/server-error';
        const errorMessage = 'Error when exchanging public token with Plaid';
        res.status(500).json({ errorCode, errorMessage });
        return;
      }
      const accessToken = response.access_token;
      const itemID = response.item_id;
      const uid = req.decodedIDToken.uid;
      const nowInSeconds = Math.floor(Date.now() / 1000);
      try {
        await FirebaseAdmin.database()
          .ref(`PlaidCredentials/${uid}/${itemID}`)
          .set({
            accessToken,
            createdAt: nowInSeconds,
            environment: process.env.PLAID_ENV,
            id: uid,
            itemID,
            metadata,
            modelType: 'PlaidCredentials',
            type: 'MODEL',
            updatedAt: nowInSeconds,
          });
      } catch (error) {
        const errorCode = error.code || 'infindi/server-error';
        const errorMessage = error.toString();
        const status = getStatusForErrorCode(errorCode);
        res.status(status).json({ errorCode, errorMessage });
      }
      res.json({ accessToken, itemID });
    });
  };
}

router.post('/credentials', checkPlaidClientInitialized());
router.post('/credentials', checkAuth());
router.post('/credentials', validateCredentials());
router.post('/credentials', performCredentials());
