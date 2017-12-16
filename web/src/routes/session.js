/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Common from 'common';
import CommonBackend from 'common-backend';

import express from 'express';

import { checkAuth } from '../middleware';
import { INFO } from '../log-utils';

import type { ID, Seconds } from 'common/src/types/core';
import type { RouteHandler } from '../middleware';
import type { UserSession } from 'common/src/types/db';

const router = express.Router();

export default router;

export function initialize(): void {}

const CLOSE_SESSION_TIMEOUT: Seconds = 5 * 60;

// -----------------------------------------------------------------------------
//
// POST session/start
//
// -----------------------------------------------------------------------------

function validateStart(): RouteHandler {
  return (req, res, next) => {
    const { device } = req.body;

    if (!device || typeof device !== 'object') {
      sendBadRequest(res, 'Request must contain valid "device"');
      return;
    }

    if (!device.appBuildNumber || typeof device.appBuildNumber !== 'number') {
      sendBadRequest(res, 'Request must contain valid "device.appBuildNumber"');
      return;
    }

    if (!device.appVersion || typeof device.appVersion !== 'string') {
      sendBadRequest(res, 'Request must contain valid "device.appVersion"');
      return;
    }

    if (
      !device.bundleIdentifier ||
      typeof device.bundleIdentifier !== 'string'
    ) {
      sendBadRequest(
        res,
        'Request must contain valid "device.buildIdentifier"',
      );
      return;
    }

    if (!device.deviceID || typeof device.deviceID !== 'string') {
      sendBadRequest(res, 'Request must contain valid "device.deviceID"');
      return;
    }

    if (!device.osVersion || typeof device.osVersion !== 'string') {
      sendBadRequest(res, 'Request must contain valid "device.osVersion"');
      return;
    }

    next();
  };
}

function handleExistingSessions(): RouteHandler {
  return async (req, res, next) => {
    const { device } = req.body;

    // NOTE: We first need to check if we have too many sessions already open with
    // this device id and bundle identifier.
    const { bundleIdentifier, deviceID } = device;
    let snapshotOpen;
    let snapshotNonResponsive;
    try {
      snapshotOpen = await CommonBackend.DB.transformError(
        FirebaseAdmin.firestore()
          .collection('UserSessions')
          .where('status', '==', 'OPEN')
          .where('device.deviceID', '==', deviceID)
          .where('device.bundleIdentifier', '==', bundleIdentifier)
          .limit(1)
          .get(),
      );
    } catch (error) {
      const errorCode =
        error.errorCode ||
        error.code ||
        error.error_code ||
        'infindi/server-error';
      const errorMessage =
        error.errorMessage ||
        error.message ||
        error.error_message ||
        error.toString();
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    try {
      snapshotNonResponsive = await CommonBackend.DB.transformError(
        FirebaseAdmin.firestore()
          .collection('UserSessions')
          .where('status', '==', 'NON_RESPONSIVE')
          .where('device.deviceID', '==', deviceID)
          .where('device.bundleIdentifier', '==', bundleIdentifier)
          .limit(1)
          .get(),
      );
    } catch (error) {
      const errorCode =
        error.errorCode ||
        error.code ||
        error.error_code ||
        'infindi/server-error';
      const errorMessage =
        error.errorMessage ||
        error.message ||
        error.error_message ||
        error.toString();
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    const docs = snapshotOpen.docs.concat(snapshotNonResponsive.docs);

    if (docs.length === 0 || !docs[0].exists) {
      INFO('SESSION', 'No existing sessions found when starting new session');
      next();
      return;
    }

    const session = docs[0].data();
    const { timeout, updatedAt } = session;

    const now = Math.floor(Date.now() / 1000);
    const lastUpdate = Math.floor(updatedAt.getTime() / 1000);

    if (lastUpdate + timeout - now < CLOSE_SESSION_TIMEOUT) {
      INFO('SESSION', 'Found an existing session that will be reused');
      // TODO: In the future, we should do some more strict checking here.
      const existingSession = {
        ...Common.DBUtils.updateModelStub(session),
        status: 'OPEN',
      };
      try {
        await genUpdateSession(existingSession);
      } catch (error) {
        const errorCode =
          error.errorCode ||
          error.code ||
          error.error_code ||
          'infindi/server-error';
        const errorMessage =
          error.errorMessage ||
          error.message ||
          error.error_message ||
          error.toString();
        const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
        res.status(status).json({ errorCode, errorMessage });
      }
      res.json({
        data: {
          pointerType: 'UserSession',
          type: 'POINTER',
          refID: session.id,
        },
      });
      return;
    } else {
      INFO('SESSION', 'Found an existing session that must be closed');
      const expiredSession = {
        ...Common.DBUtils.updateModelStub(session),
        status: 'CLOSED',
      };
      try {
        await genUpdateSession(expiredSession);
      } catch (error) {
        const errorCode =
          error.errorCode ||
          error.code ||
          error.error_code ||
          'infindi/server-error';
        const errorMessage =
          error.errorMessage ||
          error.message ||
          error.error_message ||
          error.toString();
        const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
        res.status(status).json({ errorCode, errorMessage });
        return;
      }
      // We closed the previous session, go to the next middleware function to
      // create a new request.
      next();
    }
  };
}

function performStart(): RouteHandler {
  return async (req, res) => {
    INFO('SESSION', 'Starting a new user session');
    const { device } = req.body;

    // We do not have any existing sessions. Creating a new one.
    const stub = Common.DBUtils.createModelStub('UserSession');
    const session = {
      ...stub,
      device,
      sessionID: stub.id, // TODO: Get rid of this.
      status: 'OPEN',
      timeout: 60,
      userRef: {
        pointerType: 'User',
        refID: req.decodedIDToken.uid,
        type: 'POINTER',
      },
    };
    try {
      await genCreateSession(session);
    } catch (error) {
      const errorCode =
        error.errorCode ||
        error.code ||
        error.error_code ||
        'infindi/server-error';
      const errorMessage =
        error.errorMessage ||
        error.message ||
        error.error_message ||
        error.toString();
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }
    res.json({
      data: {
        pointerType: 'UserSession',
        type: 'POINTER',
        refID: session.id,
      },
    });
  };
}

router.post('/start', checkAuth());
router.post('/start', validateStart());
router.post('/start', handleExistingSessions());
router.post('/start', performStart());

// -----------------------------------------------------------------------------
//
// POST session/heatbeat
//
// -----------------------------------------------------------------------------

function performHeartbeat(): RouteHandler {
  return async (req, res) => {
    INFO('SESSION', 'Handling session heartbeat');
    const { sessionID } = req.params;
    let session;
    try {
      session = await genSession(sessionID);
    } catch (error) {
      const errorCode =
        error.errorCode ||
        error.code ||
        error.error_code ||
        'infindi/server-error';
      const errorMessage =
        error.errorMessage ||
        error.message ||
        error.error_message ||
        error.toString();
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    if (!session) {
      const errorCode = 'infindi/resource-not-found';
      const errorMessage = `No session found with ID: ${sessionID}`;
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    if (session.userRef.refID !== req.decodedIDToken.uid) {
      // NOTE: For security reasons, if a user is trying to access a session
      // that does not belong to him, we will just pretend it does not even
      // exist.
      const errorCode = 'infindi/resource-not-found';
      const errorMessage = `No session found with ID: ${sessionID}`;
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
    }

    if (session.status === 'CLOSED') {
      const errorCode = 'infindi/bad-request';
      const errorMessage = 'Cannot update closed session';
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    const updatedSession = {
      ...Common.DBUtils.updateModelStub(session),
      status: 'OPEN',
    };

    try {
      await genUpdateSession(updatedSession);
    } catch (error) {
      const errorCode =
        error.errorCode ||
        error.code ||
        error.error_code ||
        'infindi/server-error';
      const errorMessage =
        error.errorMessage ||
        error.message ||
        error.error_message ||
        error.toString();
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    res.json({
      data: {
        pointerType: 'UserSession',
        type: 'POINTER',
        refID: updatedSession.id,
      },
    });
  };
}

router.post('/heartbeat/:sessionID', checkAuth());
router.post('/heartbeat/:sessionID', performHeartbeat());

// -----------------------------------------------------------------------------
//
// POST session/stop
//
// -----------------------------------------------------------------------------

function performEnd(): RouteHandler {
  return async (req, res) => {
    INFO('SESSION', 'Ending session');
    const { sessionID } = req.params;
    let session: ?UserSession;
    try {
      session = await genSession(sessionID);
    } catch (error) {
      const errorCode =
        error.errorCode ||
        error.code ||
        error.error_code ||
        'infindi/server-error';
      const errorMessage =
        error.errorMessage ||
        error.message ||
        error.error_message ||
        error.toString();
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    if (!session) {
      const errorCode = 'infindi/resource-not-found';
      const errorMessage = `No session found with ID: ${sessionID}`;
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    if (session.userRef.refID !== req.decodedIDToken.uid) {
      const errorCode = 'infindi/resource-not-found';
      const errorMessage = `No session found with ID: ${sessionID}`;
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    if (session.status === 'CLOSED') {
      const errorCode = 'infindi/bad-request';
      const errorMessage = 'Cannot end a session that is already closed';
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    const updatedSession = {
      ...Common.DBUtils.updateModelStub(session),
      status: 'CLOSED',
    };

    try {
      await genUpdateSession(updatedSession);
    } catch (error) {
      const errorCode =
        error.errorCode ||
        error.code ||
        error.error_code ||
        'infindi/server-error';
      const errorMessage =
        error.errorMessage ||
        error.message ||
        error.error_message ||
        error.toString();
      const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }

    res.json({
      data: {
        pointerType: 'POINTER',
        type: 'UserSession',
        refID: updatedSession.id,
      },
    });
  };
}

router.post('/end/:sessionID', checkAuth());
router.post('/end/:sessionID', performEnd());

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function sendBadRequest(res: Object, errorMessage: string): void {
  const errorCode = 'infindi/bad-request';
  const status = Common.ErrorUtils.getStatusForErrorCode(errorCode);
  res.status(status).json({ errorCode, errorMessage });
}

async function genSession(id: ID): Promise<?UserSession> {
  const document = await CommonBackend.DB.transformError(
    FirebaseAdmin.firestore()
      .collection('UserSessions')
      .doc(id)
      .get(),
  );
  return document.exists ? document.data() : null;
}

async function genUpdateSession(session: UserSession): Promise<void> {
  await CommonBackend.DB.transformError(
    FirebaseAdmin.firestore()
      .collection('UserSessions')
      .doc(session.id)
      .set(session),
  );
}

async function genCreateSession(session: UserSession): Promise<void> {
  await CommonBackend.DB.transformError(
    FirebaseAdmin.firestore()
      .collection('UserSessions')
      .doc(session.id)
      .set(session),
  );
}
