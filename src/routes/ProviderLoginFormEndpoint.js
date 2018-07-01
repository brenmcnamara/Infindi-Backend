/* @flow */

import AccountLink from 'common/lib/models/AccountLink';
import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkMutator from 'common/lib/models/AccountLinkMutator';
import AccountLinkOperations from '../operations/account-link';
import AccountLinkTestUtils, {
  TEST_YODLEE_PROVIDER_ID,
} from '../operations/account-link/test-utils';
import Endpoint from './helpers/Endpoint';
import Extractor from './helpers/Extractor';
import FindiError from 'common/lib/FindiError';
import Provider from 'common/lib/models/Provider';
import ProviderFetcher from 'common/lib/models/ProviderFetcher';

import { createPointer } from 'common/lib/db-utils';
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
    const providerID = Extractor.extractString(req.query, 'providerID');

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

    // STEP 1: Fetch the provider we are logging into.

    const provider =
      providerID === TEST_YODLEE_PROVIDER_ID
        ? await Promise.resolve(AccountLinkTestUtils.createTestProvider())
        : await ProviderFetcher.genNullthrows(providerID);

    if (provider.sourceOfTruth.type !== 'YODLEE') {
      const errorCode = 'infindi/bad-request';
      const errorMessage = `Provider ${providerID} must come from YODLEE`;
      const toString = () => `[${errorCode}]: ${errorMessage}`;
      throw { errorCode, errorMessage, toString };
    }

    // STEP 2: Fetch the login form for the provider.

    const { loginForm } = request.body;

    // STEP 3: Fetch the account link (or create one if there is none).

    const { userID } = this.__getAuthentication();
    let accountLink = await AccountLinkFetcher.genForUserAndProvider(
      userID,
      providerID,
    );

    if (!accountLink && providerID === TEST_YODLEE_PROVIDER_ID) {
      accountLink = AccountLinkTestUtils.createTestAccountLink(userID);
      await AccountLinkMutator.genSet(accountLink);
    } else if (!accountLink) {
      const accountLinkSourceOfTruth = { target: 'YODLEE', type: 'EMPTY' };
      accountLink = AccountLink.create(
        accountLinkSourceOfTruth,
        userID,
        providerID,
        provider.name,
      );
      await AccountLinkMutator.genSet(accountLink);
    }

    // STEP 4: Perform the login in the background.

    const linkPayload = { loginForm, type: 'PERFORM_LOGIN' };
    AccountLinkOperations.performLink(
      accountLink.id,
      linkPayload,
      false, // shouldForceLinking
    );

    return {
      body: {
        accountLinkRef: createPointer('AccountLink', accountLink.id),
      },
    };
  }
}
