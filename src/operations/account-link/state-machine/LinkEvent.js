/* @flow */

import type AccountLink from 'common/lib/models/AccountLink';
import type FindiError from 'common/lib/FindiError';

export type LinkEvent =
  | LinkEvent$Error
  | LinkEvent$ForceTerminateLinking
  | LinkEvent$UpdateAccountLink;

type LinkEvent$UpdateAccountLink = {
  accountLink: AccountLink,
  type: 'UPDATE_ACCOUNT_LINK',
};

type LinkEvent$Error = {
  error: FindiError,
  errorType: 'INTERNAL',
  type: 'ERROR',
};

type LinkEvent$ForceTerminateLinking = {
  type: 'FORCE_TERMINATE_LINKING',
};
