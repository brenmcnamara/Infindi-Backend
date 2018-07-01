/* @flow */

import Endpoint from './helpers/Endpoint';
import Extractor from './helpers/Extractor';
import FindiError from 'common/lib/FindiError';
import FirebaseAdmin from 'firebase-admin';
import UserInfo from 'common/lib/models/UserInfo';
import UserInfoMutator from 'common/lib/models/UserInfoMutator';

import { createPointer } from 'common/lib/db-utils';
import { ERROR } from '../log-utils';

import type { Pointer } from 'common/types/core';
import type {
  PostRequest,
  Response as ResponseTemplate,
} from './helpers/types';
import type { SignUpForm } from 'common/lib/models/Auth';

export type Request = PostRequest<RequestParams, RequestQuery, RequestBody>;

export type Response = ResponseTemplate<ResponseBody>;

type RequestBody = {|
  +signUpForm: SignUpForm,
|};

type RequestParams = {};

type RequestQuery = {};

type ResponseBody = {|
  +userRef: Pointer<'User'>,
|};

export default class UserCreateEndpoint extends Endpoint<Request, Response> {
  // override
  static path = '/v1/users';

  // override
  static permissions = { type: 'PERMISSION_REQUIRED' };

  // override
  static __calculateRequestForExpressRequest(req: Object): Request {
    const signUpForm = Extractor.extractObject(req.body, 'signUpForm');

    return {
      body: { signUpForm },
      params: {},
      query: {},
    };
  }

  // override
  static async __genValidateRequest(request: Request): Promise<void> {
    const { signUpForm } = request.body;
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
    const { signUpForm } = request.body;
    const user = await FirebaseAdmin.auth().createUser({
      disabled: false,
      // displayName: <Not storing here>
      email: signUpForm.email,
      emailVerified: false,
      password: signUpForm.password,
      // phoneNumber: ?
      // photoURL: ?
    });

    const now = new Date();
    const userInfo = UserInfo.fromRaw({
      createdAt: now,
      email: signUpForm.email,
      firstName: signUpForm.firstName,
      id: user.uid,
      isAdmin: false,
      isTestUser: signUpForm.isTestUser,
      lastName: signUpForm.lastName,
      modelType: 'UserInfo',
      type: 'MODEL',
      updatedAt: now,
    });

    try {
      await UserInfoMutator.genSet(userInfo);
    } catch (error) {
      ERROR('CREATE-USER', 'Created user but failed to create user info');
      throw error;
    }

    return { body: { userRef: createPointer('User', userInfo.id) } };
  }
}
