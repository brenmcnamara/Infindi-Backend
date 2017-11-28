/* @flow */

import Plaid from 'plaid';

import express from 'express';

import { type RouteHandler } from '../middleware';

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
      res.status(500, {
        errorCode: 'infindi/server-error',
        errorMessage: 'Plaid client not initialized',
      });
    } else {
      next();
    }
  };
}

// -----------------------------------------------------------------------------
//
// POST plaid/get_access_token
//
// -----------------------------------------------------------------------------

function performGetAccessToken(): RouteHandler {
  return (req, res) => {
    const publicToken = req.body.public_token;
    plaidClient.exchangePublicToken(publicToken, (error, response) => {
      if (error !== null) {
        const errorCode = 'infindi/server-error';
        const errorMessage = error.toString();
        res.status(500).json({ errorCode, errorMessage });
        return;
      }
      const accessToken = response.access_token;
      const itemID = response.item_id;
      res.json({ accessToken, itemID });
    });
  };
}

router.post('/get_access_token', checkPlaidClientInitialized());
router.post('/get_access_token', performGetAccessToken());
