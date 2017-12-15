/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Common from 'common';
import CommonBackend from 'common-backend';

import express from 'express';

import type { RouteHandler } from '../middleware';
import type { UserSession } from 'common/src/types/db';

const router = express.Router();

export default router;

export function initialize(): void {}

// -----------------------------------------------------------------------------
//
// POST session/cleanup
//
// -----------------------------------------------------------------------------

function performCleanup(): RouteHandler {
  return async (req, res) => {
    let snapshot;
    try {
      snapshot = await CommonBackend.DB.transformError(
        FirebaseAdmin.firestore()
          .collection('UserSessions')
          .where('status', '==', 'OPEN')
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

    const nowMillis = Date.now();
    const expiredSessions = snapshot.docs
      .filter(doc => {
        if (!doc.exists) {
          return false;
        }
        const session: UserSession = doc.data();
        const sessionExpireMillis =
          session.updatedAt.getTime() + session.timeout * 1000;
        return nowMillis > sessionExpireMillis;
      })
      .map(doc => doc.data());

    if (expiredSessions.length === 0) {
      res.json({
        data: {
          expiredSessionCount: 0,
        },
      });
      return;
    }

    const batch = FirebaseAdmin.firestore().batch();

    expiredSessions.forEach(session => {
      const ref = FirebaseAdmin.firestore()
        .collection('UserSessions')
        .doc(session.id);
      const updatedSession = {
        ...Common.DBUtils.updateModelStub(session),
        status: 'NON_RESPONSIVE',
      };
      batch.update(ref, updatedSession);
    });

    try {
      await CommonBackend.DB.transformError(batch.commit());
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
        expiredSessionCount: expiredSessions.length,
      },
    });
  };
}

router.post('/cleanup', performCleanup());
