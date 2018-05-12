/* @flow */

import type { AccountLink } from 'common/lib/models/AccountLink';
import type { ProviderAccount as YodleeProviderAccount } from 'common/types/yodlee-v1.0';

export type LinkEvent = LinkEvent$Error | LinkEvent$UpdateYodleeProviderAccount;

type LinkEvent$UpdateYodleeProviderAccount = {
  accountLink: AccountLink,
  providerAccount: YodleeProviderAccount,
  type: 'UPDATE_YODLEE_PROVIDER_ACCOUNT',
};

type LinkEvent$Error = {
  errorType: 'INTERNAL',
  errorMessage: string,
  type: 'ERROR',
};
