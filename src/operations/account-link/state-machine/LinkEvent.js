/* @flow */

import type { AccountLink } from 'common/lib/models/AccountLink';

export type LinkEvent = LinkEvent$Error | LinkEvent$UpdateAccountLink;

type LinkEvent$UpdateAccountLink = {
  accountLink: AccountLink,
  type: 'UPDATE_ACCOUNT_LINK',
};

type LinkEvent$Error = {
  errorType: 'INTERNAL',
  errorMessage: string,
  type: 'ERROR',
};
