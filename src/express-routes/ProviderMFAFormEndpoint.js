/* @flow */

import Endpoint from './helpers/Endpoint';
import Extractor from './helpers/Extractor';
import FindiError from 'common/lib/FindiError';
import Provider from 'common/lib/models/Provider';

import genSetProviderMFAForm from '../web-service/genSetProviderMFAForm';

import type { ID, Pointer } from 'common/types/core';
import type { LoginForm as YodleeLoginForm } from 'common/types/yodlee-v1.0';

export type Request = {
  providerID: ID,
};

export type Response = {
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

    return { mfaForm, providerID };
  }

  // override
  async __genResponse(request: Request): Promise<Response> {
    const { mfaForm, providerID } = request;

    const accountLinkRef = await genSetProviderMFAForm(
      this.__getAuthentication(),
      providerID,
      mfaForm,
    );
    return { accountLinkRef };
  }
}
