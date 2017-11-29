/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Plaid from 'plaid';

import express from 'express';
import uuid from 'uuid/v4';

import { checkAuth, type RouteHandler } from '../middleware';
import { getStatusForErrorCode } from '../error-codes';

import { type PlaidCredentials, type PlaidDownloadRequest } from '../types/db';

type JSONMap<K: string, V> = { [string: K]: V };

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
            id: itemID,
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

// -----------------------------------------------------------------------------
//
// POST plaid/download/:itemID
//
// -----------------------------------------------------------------------------

function performDownload(): RouteHandler {
  return async (req, res) => {
    const Database = FirebaseAdmin.database();

    const { decodedIDToken } = req;
    const { uid } = decodedIDToken;
    const { credentialsID } = req.params;

    // Step 1: Fetch the credentials we are trying to write to. Make sure they
    // exist. SHould now start a download request for credentials that do not
    // exist.
    let plaidCredentials: ?PlaidCredentials = null;
    try {
      plaidCredentials = await Database.ref(
        `PlaidCredentials/${uid}/${credentialsID}`,
      ).once('value');
    } catch (error) {
      const errorCode = error.code || 'infindi/server-error';
      const errorMessage = error.toString();
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    if (!plaidCredentials) {
      const errorCode = 'infindi/resource-not-found';
      const errorMessage = `Could not find credentials with id: ${
        credentialsID
      }`;
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    // Start a transaction when making a download request. We do not want
    // multiple download requests to start for the same item. This can happen
    // if different firebase clients are writing simultaneously to Firebase.
    type RequestMap = JSONMap<string, PlaidDownloadRequest>;
    const requestID = uuid();
    let transactionError = null;
    function transaction(map: RequestMap): RequestMap {
      // Step 2: Check if there are any credentials that have already been
      // started for this item.
      const requests: Array<PlaidDownloadRequest> = getValues(map);
      for (const request of requests) {
        if (isRequestOpen(request)) {
          // We already have a running request for the given item. Cannot
          // create a second download request.
          const errorCode = 'infindi/bad-request';
          // eslint-disable-next-line max-len
          const errorMessage = `Trying to start a plaid download request when request already exists for credentials ${
            credentialsID
          }`;
          transactionError = { errorCode, errorMessage };
          return map;
        }
      }

      // Step 3: Could not find any open requests for this item. Time to
      // create one.
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const downloadRequest = {
        createdAt: nowInSeconds,
        credentialsRef: {
          pointerType: 'PlaidCredentials',
          refID: credentialsID,
          type: 'POINTER',
        },
        id: requestID,
        modelType: 'PlaidDownloadRequest',
        status: { type: 'NOT_INITIALIZED' },
        type: 'MODEL',
        updatedAt: nowInSeconds,
      };

      return { ...map, [requestID]: downloadRequest };
    }

    try {
      await Database.ref(
        `PlaidDownloadRequests/${uid}/${credentialsID}`,
      ).transaction(transaction);
    } catch (error) {
      // Could be a Firebase error or an infindi error.
      const errorCode = error.code || 'infindi/server-error';
      const errorMessage = error.toString();
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    // We found an error while performing the transaction. This is different
    // than an error when trying to commit the transaction to Firebase.
    if (transactionError) {
      const status = getStatusForErrorCode(transactionError.errorCode);
      res.status(status).json(transactionError);
      return;
    }

    // TODO: Do I need to check the committed flag on the transaction result?
    // Or can I assume that it was a success if it did not throw an error?
    // https://firebase.google.com/docs/reference/js/firebase.database.Reference#transaction
    res.json({
      data: {
        pointerType: 'PlaidDownloadRequest',
        refID: requestID,
        type: 'POINTER',
      },
    });
  };
}

router.post('/download/:credentialsID', checkPlaidClientInitialized());
router.post('/download/:credentialsID', checkAuth());
router.post('/download/:credentialsID', performDownload());

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function isRequestOpen(request: PlaidDownloadRequest): bool {
  return (
    request.status.type === 'NOT_INITIALIZED' ||
    request.status.type === 'IN_PROGRESS'
  );
}

function getValues<V>(obj: JSONMap<*, V>): Array<V> {
  const values = [];
  for (let prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      values.push(obj[prop]);
    }
  }
  return values;
}
