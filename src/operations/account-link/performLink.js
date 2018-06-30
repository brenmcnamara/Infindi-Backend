/* @flow */

import AccountLinkTestUtils from './test-utils';
import LinkEngine from './state-machine/LinkEngine';
import LinkStateMachine from './state-machine/LinkStateMachine';

import type { ID } from 'common/types/core';
import type { LinkPayload } from './state-machine/LinkStateMachine';

/**
 * Perform the link for an account link. Sync the data with an existing account
 * link with the source of truth.
 */
export default function performLink(
  accountLinkID: ID,
  payload: LinkPayload,
  shouldForceLinking: boolean = false,
): void {
  if (AccountLinkTestUtils.isTestAccountLinkID(accountLinkID)) {
    AccountLinkTestUtils.genTestPerformLink(accountLinkID, payload);
    return;
  }

  const engine = new LinkEngine(accountLinkID);
  const machine = new LinkStateMachine({
    accountLinkID,
    engine,
    payload,
    shouldForceLinking,
  });

  machine.initialize();
}
