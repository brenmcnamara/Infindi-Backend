/* @flow */

import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkQuery from 'common/lib/models/AccountLinkQuery';
import AccountLinkTestUtils, {
  TEST_YODLEE_PROVIDER_ID,
} from '../operations/account-link/test-utils';
import FindiError from 'common/lib/FindiError';
import YodleeManager from '../yodlee/YodleeManager-V1.0';

import invariant from 'invariant';

import { createPointer } from 'common/lib/db-utils';

import type AccountLink from 'common/lib/models/AccountLink';

import type { ID, Pointer } from 'common/types/core';
import type {
  LoginForm as YodleeLoginForm,
  ProviderAccount as YodleeProviderAccount,
} from 'common/types/yodlee-v1.0';
import type { RequestAuthentication } from '../express-routes/helpers/types';

export default (async function genSetProviderMFAForm(
  auth: RequestAuthentication,
  providerID: ID,
  mfaForm: YodleeLoginForm,
): Promise<Pointer<'AccountLink'>> {
  const { userID } = auth;

  const accountLink = await AccountLinkFetcher.genSingleQuery(
    AccountLinkQuery.Single.forUserAndProvider(userID, providerID),
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
    await YodleeManager.genProviderAccountMFALogin(
      userID,
      String(providerAccount.id),
      mfaForm,
    );
  }

  return createPointer(accountLink.id);
});

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
