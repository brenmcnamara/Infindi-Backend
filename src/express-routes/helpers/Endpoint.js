/* @flow */

/* eslint-disable max-len */

import FindiError from 'common/lib/FindiError';
import FirebaseAdmin from 'firebase-admin';

import invariant from 'invariant';

import { handleError } from './express-utils';

import type { DecodedIDToken } from 'common/types/firebase-admin';
import type {
  ExpressRouteHandler,
  Permissions,
  RequestAuthentication,
} from './types';
import type { ID } from 'common/types/core';

/**
 * This is the base class for all get endpoints. The goal of this class is to:
 *
 * (1) Remove any boilerplate in the routing process
 * (2) Maintain consistency across all endpoints.
 * (3) Add typing and validation to the contents of the request.
 */
export default class Endpoint<TRequest: Object, TResponse: Object> {
  // ---------------------------------------------------------------------------
  //
  // MUST OVERRIDE
  //
  // ---------------------------------------------------------------------------

  static permissions: Permissions;
  static path: string;

  static __calculateRequest(expressRequest: Object): TRequest {
    return invariant(
      false,
      'Expecting subclass of GetEndpoint to override static method __calculateRequestt: %s',
      this.path,
    );
  }

  /**
   * Processes the request and returns a response. This method may perform
   * side effects.
   */
  __genResponse(request: TRequest): Promise<TResponse> {
    return invariant(
      false,
      'Expecting subclass of GetEndpoint to override static method __genResponse: %s',
      this.constructor.path,
    );
  }

  // ---------------------------------------------------------------------------
  //
  // MAY OVERRIDE
  //
  // ---------------------------------------------------------------------------

  /**
   * If validation of the request fails, this should return a promise that
   * throws an error. There should be no side effects in this functions.
   */
  static __genValidateRequest(request: TRequest): Promise<void> {
    return Promise.resolve();
  }

  // ---------------------------------------------------------------------------
  //
  // DO NOT OVERRIDE
  //
  // ---------------------------------------------------------------------------

  _authentication: RequestAuthentication | null;

  __getAuthentication(): RequestAuthentication {
    invariant(
      this._authentication,
      'Expecting authentication to be defined for endpoint: %s',
      this.constructor.path,
    );
    return this._authentication;
  }

  __getUserID(): ID {
    invariant(
      this._authentication,
      'authentication is not defined: %s',
      this.constructor.path,
    );
    return this._authentication.userID;
  }

  static async _genAuthenticate(
    expressReq: Object,
    permissions: Permissions,
  ): Promise<RequestAuthentication | null> {
    switch (permissions.type) {
      case 'NO_PERMISSION_REQUIRED': {
        return null;
      }

      case 'PERMISSION_REQUIRED': {
        // TODO: FIREBASE_DEPENDENCY
        const Auth = FirebaseAdmin.auth();
        const idToken = expressReq.get('Authorization');
        if (!idToken) {
          throw FindiError.fromRaw({
            errorCode: 'CORE / PERMISSION_DENIED',
            errorMessage: `User must be authorized to make a GET request at ${
              this.path
            }`,
          });
        }
        const decodedIDToken: DecodedIDToken = await Auth.verifyIdToken(
          idToken,
        );
        return { userID: decodedIDToken.uid };
      }

      default: {
        return invariant(
          false,
          'Unrecognized permissions %s for endpoint: %s',
          permissions.type,
          this.path,
        );
      }
    }
  }

  _getPath(): string {
    invariant(
      this.constructor.path,
      'Expecting subclass of GetEndpoint to override the __path variable',
    );
    return this.constructor.path;
  }

  getExpressHandle(): ExpressRouteHandler {
    return handleError(async (req, res) => {
      const { permissions } = this.constructor;
      const authentication = await this.constructor._genAuthenticate(
        req,
        permissions,
      );
      this._authentication = authentication;

      const request = this.constructor.__calculateRequest(req);
      await this.constructor.__genValidateRequest(request);
      const response = await this.__genResponse(request);
      res.status(200).json({ data: response });
    }, true);
  }
}
