/* @flow */

import Common from 'common';

import type { RouteHandler } from './middleware';

export function handleError(
  routeHandler: RouteHandler,
  isAsync: boolean = false,
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
        const status = getStatusForError(error);
        res.status(status).json(infindiError);
      }
    }
  };
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function getStatusForError(error: Error): number {
  if (error.errorCode === 'Y400') {
    // This may not always be correct.
    return 401;
  }
  return Common.ErrorUtils.getStatusForErrorCode(error.errorCode);
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
