/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Common from 'common';
import CommonBackend from 'common-backend';
import Plaid from 'plaid';

import express from 'express';

import { checkAuth } from '../middleware';
import { DEBUG, ERROR, INFO } from '../log-utils';

import type { Environment as Plaid$Environment } from 'common/src/types/plaid';
import type { ID } from 'common/src/types/core';
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
  return handleError((req, res) => {
    const publicToken = req.body.publicToken;
    const metadata = req.body.metadata || {};

    INFO('PLAID', 'Exchanging plaid public token for access token');
    plaidClient.exchangePublicToken(publicToken, async (error, response) => {
      if (error !== null) {
        ERROR(
          'PLAID',
          `Public token exchange failed: [${error.error_code}]: ${
            error.error_message
          }`,
        );
        throw {
          errorCode: 'infindi/server-error',
          errorMessage: 'Error when exchanging public token with Plaid',
        };
      }
      INFO('PLAID', 'Generated item access token from plaid');
      const accessToken = response.access_token;
      const itemID = response.item_id;
      const uid = req.decodedIDToken.uid;

      // $FlowFixMe - This is correct
      const environment: Plaid$Environment = process.env.PLAID_ENV;
      const credentials: PlaidCredentials = {
        ...Common.DBUtils.createModelStub('PlaidCredentials'),
        accessToken,
        downloadStatus: { type: 'NOT_DOWNLOADED' },
        environment,
        id: itemID,
        itemID,
        metadata,
        userRef: {
          pointerType: 'User',
          type: 'POINTER',
          refID: uid,
        },
      };

      await FirebaseAdmin.firestore()
        .collection('PlaidCredentials')
        .doc(itemID)
        .set(credentials);

      res.json({
        data: {
          pointerType: 'PlaidCredentials',
          type: 'POINTER',
          refID: credentials.id,
        },
      });
    });
  });
}

router.post('/credentials', checkPlaidClientInitialized());
router.post('/credentials', checkAuth());
router.post('/credentials', validateCredentials());
router.post('/credentials', performCredentials());

// -----------------------------------------------------------------------------
//
// POST plaid/credentials/:credentialsID/download
//
// -----------------------------------------------------------------------------

function performDownload(): RouteHandler {
  return handleError(async (req, res) => {
    const { credentials } = req;
    const { uid } = req.decodedIDToken;

    INFO('PLAID', 'Submitting job for downloading plaid item');
    const requestPointer = await CommonBackend.Job.genRequestJob(
      'PLAID_INITIAL_DOWNLOAD',
      { credentialsID: credentials.id, userID: uid },
    );

    res.json({ data: requestPointer });
  }, true);
}

router.post(
  '/credentials/:credentialsID/download',
  checkPlaidClientInitialized(),
);
router.post('/credentials/:credentialsID/download', checkAuth());
router.post('/credentials/:credentialsID/download', checkCredentials());
router.post('/credentials/:credentialsID/download', performDownload());

// -----------------------------------------------------------------------------
//
// GET /plaid/credentials/:credentialsID/download
//
// -----------------------------------------------------------------------------

function performDownloadStatus(): RouteHandler {
  return handleError(async (req, res) => {
    const Database = FirebaseAdmin.firestore();

    const { credentials } = req;

    // Step 2: Fetch the download request for the credentials.
    // TODO: Add typing to snapshot.
    const snapshot = await Database.collection('JobRequests')
      .where('name', '==', 'PLAID_INITIAL_DOWNLOAD')
      .where('payload.credentialsID', '==', credentials.id)
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();

    if (!snapshot.docs === 0 || !snapshot.docs[0].exists) {
      const errorCode = 'infindi/resource-not-found';
      const errorMessage = `No download requests exist for credentials ${
        credentials.id
      }`;
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    res.json({ data: snapshot.docs[0].data() });
  }, true);
}

router.get(
  '/credentials/:credentialsID/download',
  checkPlaidClientInitialized(),
);
router.get('/credentials/:credentialsID/download', checkAuth());
router.get('/credentials/:credentialsID/download', checkCredentials());
router.get('/credentials/:credentialsID/download', performDownloadStatus());

// -----------------------------------------------------------------------------
//
// GET /plaid/credentials/status
//
// -----------------------------------------------------------------------------

function performCredentialsStatus(): RouteHandler {
  return handleError(async (req, res) => {
    const Database = FirebaseAdmin.firestore();
    const { uid } = req.decodedIDToken;

    const snapshot = await Database.collection('PlaidCredentials')
      .where('userRef.refID', '==', uid)
      .get();

    const credentialsList = snapshot.docs
      .filter(doc => doc.exists)
      .map(doc => doc.data());

    const data = {};

    credentialsList.forEach(credentials => {
      data[credentials.id] = credentials.downloadStatus;
    });

    res.json({ data });
  }, true);
}

router.get('/credentials/status', checkPlaidClientInitialized());
router.get('/credentials/status', checkAuth());
router.get('/credentials/status', performCredentialsStatus());

// -----------------------------------------------------------------------------
//
// POST /plaid/webhook
//
// -----------------------------------------------------------------------------

// TODO: We do not yet support deleting or updating transactions. Need to
// do that and make sure it's secure.
function performWebhook(): RouteHandler {
  INFO('PLAID', 'Receiving plaid webhook update');
  return handleError(async (req, res) => {
    const DONE = () => res.status(201).json({ status: 'OK' });

    const payload = req.body;
    const credentialsID = payload.item_id;

    const credentials = await genCredentials(credentialsID);
    if (!credentials) {
      // NOTE: This should be a security notice.
      INFO(
        'PLAID',
        'Quitting plaid webhook update because credentials being updated do not exist',
      );
      return DONE();
    }

    INFO('PLAID', 'Checking if we have running updates for this user');
    const [unclaimedRequests, runningRequests] = await Promise.all([
      await genDocs(
        FirebaseAdmin.firestore()
          .collection('JobRequests')
          .where('name', '==', 'UPDATE_ALL')
          .where('status', '==', 'UNCLAIMED')
          .where('payload.userID', '==', credentials.userRef.refID)
          .get(),
      ),
      await genDocs(
        FirebaseAdmin.firestore()
          .collection('JobRequests')
          .where('name', '==', 'UPDATE_ALL')
          .where('status', '==', 'RUNNING')
          .where('payload.userID', '==', credentials.userRef.refID)
          .get(),
      ),
    ]);

    // TODO: There could be race conditions here.
    // Already performing a user download. Should not be doing this.
    if (unclaimedRequests.length > 0 || runningRequests.length > 0) {
      INFO('PLAID', 'Updates exist. Quitting early');
      return DONE();
    }

    INFO('PLAID', 'No updates exist. Starting a plaid update for this user');
    await CommonBackend.Job.genRequestJob('UPDATE_ALL', {
      userID: credentials.userRef.refID,
    });

    return DONE();
  }, true);
}

router.post('/webhook', performWebhook());

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

// TODO: Should this return null or throw error when they do not exist?
async function genCredentials(credentialsID: ID): Promise<?PlaidCredentials> {
  const document = await FirebaseAdmin.firestore()
    .collection('PlaidCredentials')
    .doc(credentialsID)
    .get();
  return document.exists ? document.data() : null;
}

function handleError(
  routeHandler: RouteHandler,
  isAsync: bool = false,
): RouteHandler {
  return (req, res, next) => {
    if (isAsync) {
      // Assume the route handler is operating via Promise.
      routeHandler(req, res, next).catch(error => {
        const infindiError = createError(error);
        const status = Common.ErrorUtils.getStatusForErrorCode(error.errorCode);
        res.status(status).json(infindiError);
      });
    } else {
      try {
        routeHandler(req, res, next);
      } catch (error) {
        const infindiError = createError(error);
        const status = Common.ErrorUtils.getStatusForErrorCode(error.errorCode);
        res.status(status).json(infindiError);
      }
    }
  };
}

function createError(error: Object) {
  const errorCode =
    error.errorCode || error.code || error.error_code || 'infindi/server-error';
  const errorMessage =
    error.errorMessage ||
    error.message ||
    error.error_message ||
    error.toString();
  const toString = () => `[${errorCode}]: ${errorMessage}`;
  return { errorCode, errorMessage, toString };
}

// -----------------------------------------------------------------------------
//
// MIDDLEWARE UTILITIES
//
// -----------------------------------------------------------------------------

function checkPlaidClientInitialized(): RouteHandler {
  return (req, res, next) => {
    if (!plaidClient) {
      const errorCode = 'infind/server-error';
      const errorMessage = 'Plaid client not initialized';
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      const toString = () => `[${errorCode}]: ${errorMessage}`;
      res.status(status).json({ errorCode, errorMessage, toString });
      return;
    }
    next();
  };
}

function checkCredentials(): RouteHandler {
  return handleError(async (req, res, next) => {
    const { uid } = req.decodedIDToken;
    const { credentialsID } = req.params;

    DEBUG('PLAID', 'Checking plaid credentials');
    // Step 1: Make sure the credentials exist and belong to the authenticated
    // user.
    const credentials = await genCredentials(credentialsID);
    if (!credentials || credentials.userRef.refID !== uid) {
      ERROR(
        'PLAID',
        `Could not find valid credentials with id: ${credentialsID}`,
      );
      throw {
        errorCode: 'infindi/resource-not-found',
        errorMessage: 'Resource not found',
      };
    }
    req.credentials = credentials;
    next();
  }, true);
}

async function genDocs<T: Object>(
  firebaseSnapshotPromise: Object,
): Promise<Array<T>> {
  const snapshot = await firebaseSnapshotPromise;
  return snapshot.docs.filter(doc => doc.exists).map(doc => doc.data());
}
