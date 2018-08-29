/* @flow */

import Endpoint from './helpers/Endpoint';
import Extractor from './helpers/Extractor';
import FindiError from 'common/lib/FindiError';

import genCreateUser from '../web-service/genCreateUser';

import type { Pointer } from 'common/types/core';
import type { SignUpForm } from 'common/lib/models/Auth';

export type Request = {|
  +signUpForm: SignUpForm,
|};

export type Response = {|
  +userRef: Pointer<'User'>,
|};

export default class UserCreateEndpoint extends Endpoint<Request, Response> {
  // override
  static path = '/v1/users';

  // override
  static permissions = { type: 'NO_PERMISSION_REQUIRED' };

  // override
  static __calculateRequestForExpressRequest(req: Object): Request {
    const signUpForm = Extractor.extractObject(req.body, 'signUpForm');
    return { signUpForm };
  }

  // override
  static async __genValidateRequest(request: Request): Promise<void> {
    const { signUpForm } = request;
    // TODO: These checks are being done in the mobile app separately. Need
    // to unify these checks. Mobile app is more thorough and does some email
    // validation and password validation.
    if (
      typeof signUpForm.email !== 'string' ||
      typeof signUpForm.firstName !== 'string' ||
      typeof signUpForm.isTestUser !== 'boolean' ||
      typeof signUpForm.lastName !== 'string' ||
      typeof signUpForm.password !== 'string'
    ) {
      throw FindiError.fromRaw({
        errorCode: 'CORE / INVALID_ARGUMENT',
        errorMessage: `Invalid shape for "signUpForm" to endpoint ${this.path}`,
      });
    }
  }

  // override
  async __genResponse(request: Request): Promise<Response> {
    const { signUpForm } = request;
    const userRef = await genCreateUser(signUpForm);
    return { userRef };
  }
}
