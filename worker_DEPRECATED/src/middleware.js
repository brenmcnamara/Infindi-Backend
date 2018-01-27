/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Common from 'common';

import type { DecodedIDToken } from 'common/types/firebase-admin';

export type RouteHandler = (req: any, res: any, next: Function) => any;

const { ErrorUtils } = Common;

// TODO: MOVE THIS STUFF TO COMMON

export function checkAuth(): RouteHandler {
  return async (req, res, next) => {
    const Auth = FirebaseAdmin.auth();
    const idToken = req.get('Authorization');
    let decodedIDToken: DecodedIDToken;
    try {
      decodedIDToken = await Auth.verifyIdToken(idToken);
    } catch (error) {
      const errorCode = error.code || 'infindi/server-error';
      const errorMessage = error.toString();
      const status = ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }
    req.decodedIDToken = decodedIDToken;
    next();
  };
}

/**
 * Authorizes the request if it is from Google Cloud PLatform.
 */
export function checkGCPCronRequest(): RouteHandler {
  return (req, res, next) => {
    const cronHeader = req.get('X-Appengine-Cron');
    const isCron = cronHeader === true || cronHeader === 'true';
    if (!isCron) {
      const errorCode = 'infindi/resource-not-found';
      const errorMessage = 'Resource not found';
      const status = ErrorUtils.getStatusForErrorCode(errorCode);
      res.status(status).json({ errorCode, errorMessage });
      return;
    }
    next();
  };
}
