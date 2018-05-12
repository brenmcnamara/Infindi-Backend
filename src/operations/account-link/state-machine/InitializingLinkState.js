/* @flow */

import LinkState from './LinkState';

import type { AccountLinkStatus } from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';

/**
 * Enter this state when starting the linking process.
 */
export default class InitializingLinkState extends LinkState {
  _status: AccountLinkStatus;

  constructor(accountLinkID: ID, status: AccountLinkStatus) {
    super(accountLinkID);
    this._status = status;
  }

  calculateNextState(linkEvent: LinkEvent) {
    return this;
  }
}
