/* @flow */

import performDeleteLink from '../operations/account-link/performDeleteLink';

import type { ID } from 'common/types/core';

export default function performDeleteAccountLink(accountLinkID: ID): void {
  performDeleteLink(accountLinkID);
}
