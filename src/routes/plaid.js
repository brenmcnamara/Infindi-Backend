/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Plaid from 'plaid';

import express from 'express';
import uuid from 'uuid/v4';

import { checkAuth, type RouteHandler } from '../middleware';
import { getStatusForErrorCode, type InfindiError } from '../error-codes';

import { type Firebase$TransactionResult } from '../types/firebase';
import { type ID } from '../types/core';
import { type PlaidCredentials, type PlaidDownloadRequest } from '../types/db';

type JSONMap<K: string, V> = { [string: K]: V };

const router = express.Router();

const ABORT_TRANSACTION = undefined;

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
// POST plaid/download/:credentialsID
//
// -----------------------------------------------------------------------------

function performDownload(): RouteHandler {
  return async (req, res) => {
    const Database = FirebaseAdmin.database();

    const { decodedIDToken } = req;
    const { uid } = decodedIDToken;
    const { credentialsID } = req.params;

    // Step 1: Fetch the credentials we are trying to write to. Make sure they
    // exist. Should now start a download request for credentials that do not
    // exist.
    try {
      await genCredentials(uid, credentialsID);
      // TODO: PROPER TYPING ON ERROR.
    } catch (error /* InfindiError */) {
      const status = getStatusForErrorCode(error.errorCode);
      res.status(status).json(error);
      return;
    }

    // Start a transaction when making a download request. We do not want
    // multiple download requests to start for the same item. This can happen
    // if different firebase clients are writing simultaneously to Firebase.
    type RequestMap = JSONMap<string, PlaidDownloadRequest>;
    const requestID = uuid();
    let transactionError = null;
    function transaction(map: ?RequestMap) {
      // Step 2: Check if there are any credentials that have already been
      // started for this item.
      if (map) {
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
            return ABORT_TRANSACTION;
          }
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

    let result: Firebase$TransactionResult;
    try {
      result = await Database.ref(
        `PlaidDownloadRequests/${uid}/${credentialsID}`,
      ).transaction(transaction);
    } catch (error) {
      // TODO: Should prioritize transaction errors. So if we get an error
      // thrown here and we notice that we set a transaction error, should
      // report the transaction error instead of this one.

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
    } else if (!result.committed) {
      const errorCode = 'infindi/server-error';
      const errorMessage = 'Firebase transaction was not committed';
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

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
// POST plaid/download/:credentialsID/cancel
//
// -----------------------------------------------------------------------------

function performDownloadCancel(): RouteHandler {
  return async (req, res) => {
    const Database = FirebaseAdmin.database();

    const { uid } = req.decodedIDToken;
    const { credentialsID } = req.params;

    // Step 1: Make sure the credentials actually exist.
    try {
      await genCredentials(uid, credentialsID);
      // TODO: PROPERTY TYPING FOR ERRORS.
    } catch (error /* InfindiError */) {
      const status = getStatusForErrorCode(error.errorCode);
      res.status(status).json(error);
      return;
    }

    let hasNonNullValue: bool = false;
    let transactionError: ?InfindiError = null;
    let canceledRequestID: ?ID = null;
    function transaction(map: ?JSONMap<string, PlaidDownloadRequest>) {
      hasNonNullValue = Boolean(map);

      if (!map) {
        return {};
      }

      const requests: Array<PlaidDownloadRequest> = getValues(map);
      // Step 2: Check if any requests are running. There should be exactly 1
      // running request that we need to cancel. Any more or less is an error.
      const openRequests = requests.filter(request => isRequestOpen(request));

      if (openRequests.length > 1) {
        transactionError = {
          errorCode: 'infindi/server-error',
          errorMessage: `More than 1 download request for a single credentials: ${
            credentialsID
          }`,
        };
        return ABORT_TRANSACTION;
      }

      if (openRequests.length === 0) {
        transactionError = {
          errorCode: 'infindi/bad-request',
          errorMessage: `No download requests to cancel for credentials: ${
            credentialsID
          }`,
        };
        return ABORT_TRANSACTION;
      }

      // Step 3: Cancel the request.
      const canceledRequest = {
        ...openRequests[0],
        status: { type: 'CANCELED' },
      };

      canceledRequestID = canceledRequest.id;
      return {
        ...map,
        [canceledRequestID]: canceledRequest,
      };
    }

    let result: Firebase$TransactionResult;

    try {
      result = await Database.ref(
        `PlaidDownloadRequests/${uid}/${credentialsID}`,
      ).transaction(transaction);
    } catch (error) {
      // TODO: Should prioritize transaction errors. So if we get an error
      // thrown here and we notice that we set a transaction error, should
      // report the transaction error instead of this one.
      const errorCode = error.code || 'infindi/server-error';
      const errorMessage = error.toString();
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    if (transactionError) {
      const status = getStatusForErrorCode(transactionError.errorCode);
      res.status(status).json(transactionError);
      return;
    } else if (!hasNonNullValue) {
      const errorCode = 'infindi/bad-request';
      const errorMessage = `No credentials with id ${credentialsID}`;
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
    } else if (!canceledRequestID) {
      const errorCode = 'infindi/server-error';
      const errorMessage = 'Could not find ID of canceled request.';
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    } else if (!result.committed) {
      const errorCode = 'infindi/server-error';
      const errorMessage = 'Firebase transaction was not committed';
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    res.json({
      data: {
        pointerType: 'PlaidDownloadRequest',
        refID: canceledRequestID,
        type: 'POINTER',
      },
    });
  };
}

router.post('/download/:credentialsID/cancel', checkPlaidClientInitialized());
router.post('/download/:credentialsID/cancel', checkAuth());
router.post('/download/:credentialsID/cancel', performDownloadCancel());

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

// TODO: Should this return null or throw error when they do not exist?
async function genCredentials(
  userID: ID,
  credentialsID: ID,
): Promise<PlaidCredentials> {
  const Database = FirebaseAdmin.database();
  let plaidCredentials: ?PlaidCredentials = null;
  try {
    plaidCredentials = await Database.ref(
      `PlaidCredentials/${userID}/${credentialsID}`,
    ).once('value');
  } catch (error) {
    const errorCode = error.code || 'infindi/server-error';
    const errorMessage = error.toString();
    throw { errorCode, errorMessage };
  }

  if (!plaidCredentials) {
    const errorCode = 'infindi/resource-not-found';
    const errorMessage = `Could not find credentials with id: ${credentialsID}`;
    throw { errorCode, errorMessage };
  }

  return plaidCredentials;
}

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
