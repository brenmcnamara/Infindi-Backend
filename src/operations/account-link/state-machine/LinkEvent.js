/* @flow */

import type { ID } from 'common/types/core';
import type { ProviderAccount as YodleeProviderAccount } from 'common/types/yodlee-v1.0';

export type LinkEvent = LinkEvent$Error | LinkEvent$UpdateYodleeProviderAccount;

type LinkEvent$UpdateYodleeProviderAccount = {
  accountLinkID: ID,
  providerAccount: YodleeProviderAccount,
  type: 'UPDATE_YODLEE_PROVIDER_ACCOUNT',
};

type LinkEvent$Error = {
  errorType: 'INTERNAL',
  errorMessage: string,
  type: 'ERROR',
};
