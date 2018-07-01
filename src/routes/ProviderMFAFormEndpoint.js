/* @flow */

import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkTestUtils, {
  TEST_YODLEE_PROVIDER_ID,
} from '../operations/account-link/test-utils';
import Endpoint from './helpers/Endpoint';
import Extractor from './helpers/Extractor';
import FindiError from 'common/lib/FindiError';
import Provider from 'common/lib/models/Provider';

import invariant from 'invariant';

import { createPointer } from 'common/lib/db-utils';
import { genProviderAccountMFALogin } from '../yodlee/yodlee-manager';

import type AccountLink from 'common/lib/models/AccountLink';

import type { ID, Pointer } from 'common/types/core';
import type {
  LoginForm as YodleeLoginForm,
  ProviderAccount as YodleeProviderAccount,
} from 'common/types/yodlee-v1.0';
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
    const providerID = Extractor.extractString(req.query, 'providerID');

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
    const { userID } = this.__getAuthentication();

    const accountLink = await AccountLinkFetcher.genForUserAndProvider(
      userID,
      providerID,
    );
    if (!accountLink) {
      throw FindiError.fromRaw({
        errorCode: 'CORE / RESOURCE_NOT_FOUND',
        errorMessage: `Could not find AccountLink for user ${userID} and provider ${providerID}`,
      });
    }

    const providerAccount = getYodleeProviderAccount(accountLink);
    if (providerID === TEST_YODLEE_PROVIDER_ID) {
      await AccountLinkTestUtils.genTestMFALogin(accountLink.id, mfaForm);
    } else {
      await genProviderAccountMFALogin(
        userID,
        String(providerAccount.id),
        mfaForm,
      );
    }

    return { body: createPointer('AccountLink', accountLink.id) };
  }
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function getYodleeProviderAccount(
  accountLink: AccountLink,
): YodleeProviderAccount {
  invariant(
    accountLink.sourceOfTruth.type === 'YODLEE',
    'Expecting account link to come from YODLEE',
  );
  return accountLink.sourceOfTruth.providerAccount;
}
