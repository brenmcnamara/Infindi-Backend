/* @flow */

import LinkState from './LinkState';

import type { AccountLinkStatus } from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';

/**
 * Enter this state when starting the linking process.
 */
export default class InitializingState extends LinkState {
  _status: AccountLinkStatus;

  constructor(accountLinkID: ID) {
    super(accountLinkID);
  }

  calculateNextState(linkEvent: LinkEvent) {
    return this;
  }
}
