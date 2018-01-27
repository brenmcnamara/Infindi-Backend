/* @flow */

import Common from 'common';
import CommonBackend from 'common-backend';

import express from 'express';

import { checkAuth } from '../middleware';

import type { RouteHandler } from '../middleware';

const router = express.Router();

export default router;

const { Job } = CommonBackend;

export function initialize(): void {}

// -----------------------------------------------------------------------------
//
// POST update
//
// -----------------------------------------------------------------------------

function performUpdateAll(): RouteHandler {
  return handleError(async (req, res) => {
    const { uid } = req.decodedIDToken;
    const jobRef = await Job.genRequestJob('UPDATE_ALL', { userID: uid });
    res.json({ data: jobRef });
  }, true);
}

router.post('/', checkAuth());
router.post('/', performUpdateAll());

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

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
