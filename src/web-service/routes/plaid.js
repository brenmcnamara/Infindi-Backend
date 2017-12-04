/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Plaid from 'plaid';

import express from 'express';

import { checkAuth, type RouteHandler } from '../middleware';
import { getStatusForErrorCode, type InfindiError } from 'common/error-codes';

import {
  type Firebase$DataSnapshot,
  type Firebase$TransactionResult,
} from 'common/types/firebase';
import { type ID } from 'common/types/core';
import {
  type PlaidCredentials,
  type PlaidDownloadRequest,
} from 'common/types/db';

type JSONMap<K: string, V> = { [string: K]: V };
type DownloadRequestMap = JSONMap<ID, PlaidDownloadRequest>;

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
          .ref(`PlaidCredentials/${itemID}`)
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
            userRef: {
              pointerType: 'User',
              type: 'POINTER',
              refID: uid,
            },
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

    // Step 1: Fetch the latest download request for the credentials.
    try {
      await genCredentials(uid, credentialsID);
    } catch (error /* InfindiError */) {
      const status = getStatusForErrorCode(error.errorCode);
      res.status(status).json(error);
      return;
    }

    // Start a transaction when making a download request. We do not want
    // multiple download requests to start for the same item. This can happen
    // if different firebase clients are writing simultaneously to Firebase.
    // A request id if we end up creating a new download request, and not just
    // updating the current one.
    let transactionError = null;
    // TODO: This won't scale. We can't be performing atomic transactions on
    // the entire PlaidDownloadRequests node, there can be thousands, if not
    // millions of requests in here.
    function transaction(request: ?PlaidDownloadRequest) {
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
        transactionError = { errorCode, errorMessage };
        return ABORT_TRANSACTION;
      }

      // Step 3: Could not find any open requests for this item. Time to
      // create one.
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const downloadRequest: PlaidDownloadRequest = {
        createdAt: request ? request.createdAt : nowInSeconds,
        credentialsRef: {
          pointerType: 'PlaidCredentials',
          refID: credentialsID,
          type: 'POINTER',
        },
        id: credentialsID,
        modelType: 'PlaidDownloadRequest',
        status: { type: 'NOT_INITIALIZED' },
        type: 'MODEL',
        updatedAt: nowInSeconds,
        userRef: {
          pointerType: 'User',
          type: 'POINTER',
          refID: uid,
        },
      };

      return downloadRequest;
    }

    let result: Firebase$TransactionResult<DownloadRequestMap>;
    try {
      result = await Database.ref(
        `PlaidDownloadRequests/${credentialsID}`,
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
    const Database = FirebaseAdmin.database();

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

    let hasNonNullValue: bool = false;
    let transactionError: ?InfindiError = null;
    // NOTE: We will assume if it cancelable until shown otherwise. If the
    // transaction does not run correctly and this variable never gets updated
    // we will hit a different type of error.
    let isCancelable: bool = true;
    function transaction(request: ?PlaidDownloadRequest) {
      hasNonNullValue = Boolean(request);

      if (!request) {
        return null;
      }

      isCancelable =
        request.status.type === 'NOT_INITIALIZED' ||
        request.status.type === 'IN_PROGRESS';

      if (!isCancelable) {
        return ABORT_TRANSACTION;
      }

      // Step 3: Cancel the request.
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const canceledRequest = {
        ...request,
        status: { type: 'CANCELED' },
        updatedAt: nowInSeconds,
      };
      return canceledRequest;
    }

    let result: Firebase$TransactionResult<DownloadRequestMap>;

    try {
      result = await Database.ref(
        `PlaidDownloadRequests/${credentialsID}`,
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

    if (!isCancelable) {
      const errorCode = 'infindi/bad-request';
      const errorMessage = 'Cannot cancel download request';
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    } else if (transactionError) {
      const status = getStatusForErrorCode(transactionError.errorCode);
      res.status(status).json(transactionError);
      return;
    } else if (!hasNonNullValue) {
      const errorCode = 'infindi/bad-request';
      const errorMessage = `No download request with id ${credentialsID}`;
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
    const Database = FirebaseAdmin.database();

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
    let snapshot: Firebase$DataSnapshot<PlaidDownloadRequest>;
    try {
      snapshot = await Database.ref(
        `PlaidDownloadRequests/${credentialsID}`,
      ).once('value');
    } catch (error) {
      const errorCode = error.code || 'infindi/server-error';
      const errorMessage = error.toString();
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    const request = snapshot.val();

    if (!request) {
      const errorCode = 'infindi/resource-not-found';
      const errorMessage = `No download requests exist for credentials ${
        credentialsID
      }`;
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    res.json({ data: request });
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
  const Database = FirebaseAdmin.database();
  let snapshot: Firebase$DataSnapshot<PlaidCredentials>;
  try {
    snapshot = await Database.ref(`PlaidCredentials/${credentialsID}`).once(
      'value',
    );
  } catch (error) {
    const errorCode = error.code || 'infindi/server-error';
    const errorMessage = error.toString();
    throw { errorCode, errorMessage };
  }

  const plaidCredentials = snapshot.val();

  if (!plaidCredentials) {
    const errorCode = 'infindi/resource-not-found';
    const errorMessage = `Could not find credentials with id: ${credentialsID}`;
    throw { errorCode, errorMessage };
  }

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
