/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Plaid from 'plaid';

import express from 'express';

import { checkAuth, type RouteHandler } from '../middleware';
import { getStatusForErrorCode } from 'common/error-codes';

import { type Environment as Plaid$Environment } from 'common/types/plaid';
import { type ID } from 'common/types/core';
import {
  type PlaidCredentials,
  type PlaidDownloadRequest,
} from 'common/types/db';

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

// TODO: Return credentials when this is done.
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
      const now = new Date();
      // $FlowFixMe - THis is correct
      const environment: Plaid$Environment = process.env.PLAID_ENV;
      const credentials: PlaidCredentials = {
        accessToken,
        createdAt: now,
        environment,
        id: itemID,
        itemID,
        metadata,
        modelType: 'PlaidCredentials',
        type: 'MODEL',
        updatedAt: now,
        userRef: {
          pointerType: 'User',
          type: 'POINTER',
          refID: uid,
        },
      };
      try {
        await FirebaseAdmin.firestore()
          .collection('PlaidCredentials')
          .doc(itemID)
          .set(credentials);
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
    const Database = FirebaseAdmin.firestore();

    const { decodedIDToken } = req;
    const { uid } = decodedIDToken;
    const { credentialsID } = req.params;

    // TODO: Move this into middleware.
    // Step 1: Make sure the credentials exist and belong to the authenticated
    // user.
    try {
      await genCredentials(uid, credentialsID);
    } catch (error /* InfindiError */) {
      const status = getStatusForErrorCode(error.errorCode);
      res.status(status).json(error);
      return;
    }

    const downloadRequestRef = Database.collection('PlaidDownloadRequests').doc(
      credentialsID,
    );

    // Start a transaction when making a download request. We do not want
    // multiple download requests to start for the same item. This can happen
    // if different firebase clients are writing simultaneously to Firebase.
    async function transactionOperation(transaction: Object) {
      const document = await transaction.get(downloadRequestRef);
      const request: ?PlaidDownloadRequest = document.exists
        ? document.data()
        : null;
      // Step 2: Check if there are any download requests for the given
      // credentials that have already been started for this item.
      if (request && isRequestOpen(request)) {
        // We already have a running request for the given item. Cannot
        // create a second download request.
        const errorCode = 'infindi/bad-request';
        // eslint-disable-next-line max-len
        const errorMessage = `Trying to start a plaid download request when a request already exists for credentials ${
          credentialsID
        }`;
        throw { errorCode, errorMessage };
      }

      // Step 3: Could not find any open requests for this item. Time to
      // create one.
      const now = new Date();
      const downloadRequest: PlaidDownloadRequest = {
        createdAt: request ? request.createdAt : now,
        credentialsRef: {
          pointerType: 'PlaidCredentials',
          refID: credentialsID,
          type: 'POINTER',
        },
        id: credentialsID,
        modelType: 'PlaidDownloadRequest',
        status: { type: 'NOT_INITIALIZED' },
        type: 'MODEL',
        updatedAt: now,
        userRef: {
          pointerType: 'User',
          type: 'POINTER',
          refID: uid,
        },
      };
      transaction.set(downloadRequestRef, downloadRequest);
    }

    try {
      await Database.runTransaction(transactionOperation);
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

    res.json({
      data: {
        pointerType: 'PlaidDownloadRequest',
        refID: credentialsID,
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
    const Database = FirebaseAdmin.firestore();

    const { uid } = req.decodedIDToken;
    const { credentialsID } = req.params;

    // Step 1: Make sure the credentials actually exist.
    try {
      await genCredentials(uid, credentialsID);
    } catch (error /* InfindiError */) {
      const status = getStatusForErrorCode(error.errorCode);
      res.status(status).json(error);
      return;
    }

    const downloadRequestRef = Database.collection('PlaidDownloadRequests').doc(
      credentialsID,
    );
    // TODO: Proper typing of transaction
    async function transactionOperation(transaction: Object) {
      const document = await transaction.get(downloadRequestRef);

      if (!document.exists) {
        const errorCode = 'infindi/resource-not-found';
        const errorMessage = `Could not find download request: ${
          credentialsID
        }`;
        throw { errorCode, errorMessage };
      }

      const request = document.data();

      if (
        request.status.type !== 'NOT_INITIALIZED' &&
        request.status.type !== 'IN_PROGRESS'
      ) {
        const errorCode = 'infindi/bad-request';
        const errorMessage = `Download request ${
          credentialsID
        } cannot be canceled`;
        throw { errorCode, errorMessage };
      }

      // Step 3: Cancel the request.
      const now = new Date();
      const canceledRequest = {
        ...request,
        status: { type: 'CANCELED' },
        updatedAt: now,
      };
      transaction.update(downloadRequestRef, canceledRequest);
    }

    try {
      await Database.runTransaction(transactionOperation);
    } catch (error) {
      const errorCode = error.errorCode || 'infindi/server-error';
      const errorMessage = error.errorMessage || error.toString();
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    res.json({
      data: {
        pointerType: 'PlaidDownloadRequest',
        refID: credentialsID,
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
// GET /plaid/download/:credentialsID
//
// -----------------------------------------------------------------------------

function performDownloadStatus(): RouteHandler {
  return async (req, res) => {
    const Database = FirebaseAdmin.firestore();

    const { uid } = req.decodedIDToken;
    const { credentialsID } = req.params;

    // Step 1: Confirm that there are credentials that exist for the particular
    // id.
    try {
      await genCredentials(uid, credentialsID);
    } catch (error /* InfindiError */) {
      const status = getStatusForErrorCode(error.errorCode);
      res.status(status).json(error);
      return;
    }

    // Step 2: Fetch the download request for the credentials.
    // TODO: Add typing to document.
    let document;
    try {
      document = await Database.collection('PlaidDownloadRequests')
        .doc(credentialsID)
        .get();
    } catch (error) {
      const errorCode = error.code || 'infindi/server-error';
      const errorMessage = error.toString();
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    if (!document.exists) {
      const errorCode = 'infindi/resource-not-found';
      const errorMessage = `No download requests exist for credentials ${
        credentialsID
      }`;
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    res.json({ data: document.data() });
  };
}

router.get('/download/:credentialsID', checkPlaidClientInitialized());
router.get('/download/:credentialsID', checkAuth());
router.get('/download/:credentialsID', performDownloadStatus());

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
  const Database = FirebaseAdmin.firestore();
  let document;
  try {
    document = await Database.collection('PlaidCredentials')
      .doc(credentialsID)
      .get();
  } catch (error) {
    const errorCode = error.code || 'infindi/server-error';
    const errorMessage = error.toString();
    throw { errorCode, errorMessage };
  }

  if (!document.exists) {
    const errorCode = 'infindi/resource-not-found';
    const errorMessage = `Could not find credentials with id: ${credentialsID}`;
    throw { errorCode, errorMessage };
  }

  const plaidCredentials = document.data();

  if (plaidCredentials.userRef.refID !== userID) {
    const errorCode = 'infindi/forbidden';
    const errorMessage = 'Accessing resource without correct permissions';
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
