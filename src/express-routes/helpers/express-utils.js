/* @flow */

import FindiError from 'common/lib/FindiError';

import { ERROR, INFO } from '../../log-utils';

import type { ExpressRouteHandler } from './types';

export function handleError(
  routeHandler: ExpressRouteHandler,
  isAsync: boolean = false,
): ExpressRouteHandler {
  return (req, res, next) => {
    if (isAsync) {
      // Assume the route handler is operating via Promise.
      routeHandler(req, res, next).catch(error => {
        const findiError = FindiError.fromUnknownEntity(error);
        const status = getStatusForFindiError(findiError);
        if (status >= 500) {
          ERROR('Routing', `Caught server error: ${findiError.toString()}`);
        } else {
          INFO('Routing', `Caught user error: ${findiError.toString()}`);
        }
        res.status(status).json({ error: findiError.toRaw() });
      });
    } else {
      try {
        routeHandler(req, res, next);
      } catch (error) {
        const findiError = FindiError.fromUnknownEntity(error);

        const status = getStatusForFindiError(error);
        if (status >= 500) {
          ERROR('Routing', `Caught server error: ${findiError.toString()}`);
        } else {
          INFO('Routing', `Caught user error: ${findiError.toString()}`);
        }
        res.status(status).json(findiError.toRaw());
      }
    }
  };
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function getStatusForFindiError(error: FindiError): number {
  switch (error.errorCode) {
    case 'CORE / INVALID_ARGUMENT':
    case 'CORE / VALIDATION_ERROR':
      return 400;

    case 'CORE / PERMISSION_DENIED':
      return 401;

    case 'CORE / RESOURCE_NOT_FOUND':
      return 404;

    case 'CORE / CRITIAL_ERROR_REQUIRES_IMMEDIATE_ADMIN_ATTENTION':
    case 'CORE / EXTERNAL_SERVICE_DENIED':
    case 'CORE / EXTERNAL_SERVICE_ERROR':
    case 'CORE / INCORRECT_EXTERNAL_SERVICE_CALL':
    case 'CORE / LOGICAL_ERROR':
    case 'CORE / NETWORK_ERROR':
    case 'CORE / UNKNOWN_ERROR':
    default:
      return 500;
  }
}
