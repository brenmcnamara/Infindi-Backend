/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import BackendAPI from 'common-backend';
import Plaid from 'plaid';

import express from 'express';

import { checkAuth } from '../middleware';
import { getStatusForErrorCode } from 'common/build/error-codes';

import type { Environment as Plaid$Environment } from 'common/src/types/plaid';
import type { ID, Pointer } from 'common/src/types/core';
import type { PlaidCredentials } from 'common/src/types/db';
import type { RouteHandler } from '../middleware';

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

    let requestPointer: Pointer<'JobRequest'>;
    try {
      requestPointer = await BackendAPI.Job.genRequestJob(
        'PLAID_INITIAL_DOWNLOAD',
        { credentialsID, userID: uid },
      );
    } catch (error) {
      const status = getStatusForErrorCode(error.errorCode);
      res.status(status).json(error);
      return;
    }
    res.json({ data: requestPointer });
  };
}

router.post('/download/:credentialsID', checkPlaidClientInitialized());
router.post('/download/:credentialsID', checkAuth());
router.post('/download/:credentialsID', performDownload());

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
    // TODO: Add typing to snapshot.
    let snapshot;
    try {
      snapshot = await Database.collection('JobRequests')
        .where('name', '==', 'PLAID_INITIAL_DOWNLOAD')
        .where('payload.credentialsID', '==', credentialsID)
        .orderBy('updatedAt', 'desc')
        .limit(1)
        .get();
    } catch (error) {
      const errorCode = error.code || 'infindi/server-error';
      const errorMessage = error.toString();
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    if (!snapshot.docs === 0 || !snapshot.docs[0].exists) {
      const errorCode = 'infindi/resource-not-found';
      const errorMessage = `No download requests exist for credentials ${
        credentialsID
      }`;
      const status = getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    res.json({ data: snapshot.docs[0].data() });
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
