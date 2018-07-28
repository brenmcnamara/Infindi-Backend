/* @flow */

import Endpoint from './helpers/Endpoint';
import Extractor from './helpers/Extractor';
import FindiError from 'common/lib/FindiError';
import Provider from 'common/lib/models/Provider';

import genSetProviderLoginForm from '../web-service/genSetProviderLoginForm';

import { DEBUG } from '../log-utils';

import type { ID, Pointer } from 'common/types/core';
import type { LoginForm as YodleeLoginForm } from 'common/types/yodlee-v1.0';
import type {
  PostRequest,
  Response as ResponseTemplate,
} from './helpers/types';

export type Request = PostRequest<RequestParams, RequestQuery, RequestBody>;

export type Response = ResponseTemplate<ResponseBody>;

type RequestBody = {
  loginForm: YodleeLoginForm,
};

type RequestParams = {
  providerID: ID,
};

type RequestQuery = {};

type ResponseBody = {
  accountLinkRef: Pointer<'AccountLink'>,
};

export default class ProviderLoginFormEndpoint extends Endpoint<
  Request,
  Response,
> {
  _providers: Array<Provider> = [];

  // override
  static path = '/v1/providers/:providerID/loginForm';

  // override
  static permissions = { type: 'PERMISSION_REQUIRED' };

  // override
  static __calculateRequestForExpressRequest(req: Object): Request {
    const providerID = Extractor.extractString(req.params, 'providerID');

    // TODO: Need to find a good way to deep-validate this.
    const loginForm: YodleeLoginForm = req.body.loginForm;

    if (!loginForm) {
      throw FindiError.fromRaw({
        errorCode: 'CORE / INVALID_ARGUMENT',
        errorMessage: `Expecting endpoint ${
          this.path
        } to be called with "loginForm"`,
      });
    }

    return {
      body: { loginForm },
      query: {},
      params: { providerID },
    };
  }

  // override
  async __genResponse(request: Request): Promise<Response> {
    DEBUG('YODLEE', 'Attempting to login with provider');
    const { providerID } = request.params;
    const { loginForm } = request.body;

    const accountLinkRef = await genSetProviderLoginForm(
      this.__getAuthentication(),
      providerID,
      loginForm,
    );
    return { body: { accountLinkRef } };
  }
}
