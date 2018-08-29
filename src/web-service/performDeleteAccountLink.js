/* @flow */

import performDeleteLink from '../operations/account-link/performDeleteLink';

export default function performDeleteAccountLink(
  accountLinkID: ID,
): Promise<void> {
  performDeleteLink(accountLinkID);
}
