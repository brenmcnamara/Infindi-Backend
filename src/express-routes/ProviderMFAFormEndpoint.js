/* @flow */

import Endpoint from './helpers/Endpoint';
import Extractor from './helpers/Extractor';
import FindiError from 'common/lib/FindiError';
import Provider from 'common/lib/models/Provider';

import genSetProviderMFAForm from '../web-service/genSetProviderMFAForm';

import type { ID, Pointer } from 'common/types/core';
import type { LoginForm as YodleeLoginForm } from 'common/types/yodlee-v1.0';
import type {
  PostRequest,
  Response as ResponseTemplate,
} from './helpers/types';

export type Request = PostRequest<RequestParams, RequestQuery, RequestBody>;

export type Response = ResponseTemplate<ResponseBody>;

type RequestBody = {
  mfaForm: YodleeLoginForm,
};

type RequestParams = {
  providerID: ID,
};

type RequestQuery = {};

type ResponseBody = {
  accountLinkRef: Pointer<'AccountLink'>,
};

export default class ProviderMFAFormEndpoint extends Endpoint<
  Request,
  Response,
> {
  _providers: Array<Provider> = [];

  // override
  static path = '/v1/providers/:providerID/mfaForm';

  // override
  static permissions = { type: 'PERMISSION_REQUIRED' };

  // override
  static __calculateRequestForExpressRequest(req: Object): Request {
    const providerID = Extractor.extractString(req.params, 'providerID');

    // TODO: Need to find a good way to deep-validate this.
    const mfaForm: YodleeLoginForm = req.body.mfaForm;

    if (!mfaForm) {
      throw FindiError.fromRaw({
        errorCode: 'CORE / INVALID_ARGUMENT',
        errorMessage: `Expecting endpoint ${
          this.path
        } to be called with "mfaForm"`,
      });
    }

    return {
      body: { mfaForm },
      query: {},
      params: { providerID },
    };
  }

  // override
  async __genResponse(request: Request): Promise<Response> {
    // TODO: Need to check if this is a valid provider id.
    const { providerID } = request.params;
    const { mfaForm } = request.body;

    const accountLinkRef = await genSetProviderMFAForm(
      this.__getAuthentication(),
      providerID,
      mfaForm,
    );
    return { body: { accountLinkRef } };
  }
}
