/* @flow */

import AccountLink from 'common/lib/models/AccountLink';
import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkMutator from 'common/lib/models/AccountLinkMutator';
import AccountLinkOperations from '../operations/account-link';
import AccountLinkQuery from 'common/lib/models/AccountLinkQuery';
import AccountLinkTestUtils, {
  TEST_YODLEE_PROVIDER_ID,
} from '../operations/account-link/test-utils';
import FindiError from 'common/lib/FindiError';
import ProviderFetcher from 'common/lib/models/ProviderFetcher';

import { createPointer } from 'common/lib/db-utils';

import type { ID, Pointer } from 'common/types/core';
import type { LoginForm as YodleeLoginForm } from 'common/types/yodlee-v1.0';
import type { RequestAuthentication } from '../express-routes/helpers/types';

export default (async function genSetProviderLoginForm(
  auth: RequestAuthentication,
  providerID: ID,
  loginForm: YodleeLoginForm,
): Promise<Pointer<'AccountLink'>> {
  const provider =
    providerID === TEST_YODLEE_PROVIDER_ID
      ? await Promise.resolve(AccountLinkTestUtils.createTestProvider())
      : await ProviderFetcher.genNullthrows(providerID);

  if (provider.sourceOfTruth.type !== 'YODLEE') {
    throw FindiError.fromRaw({
      errorCode: 'CORE / NOT_YET_IMPLEMENTED',
      // eslint-disable-next-line max-len
      errorMessage: `Provider ${providerID} is not a yodlee provider. Can only link with yodlee providers at the moment.`,
    });
  }

  const { userID } = auth;

  let accountLink = await AccountLinkFetcher.genSingleQuery(
    AccountLinkQuery.Single.forUserAndProvider(userID, providerID),
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

  const linkPayload = { loginForm, type: 'PERFORM_LOGIN' };
  AccountLinkOperations.performLink(
    accountLink.id,
    linkPayload,
    false, // shouldForceLinking
  );

  return createPointer('AccountLink', accountLink.id);
});
