/* @flow */

import InitializingLinkState from './InitializingLinkState';
import LinkEngine from './LinkEngine';

import type LinkState from './LinkState';

import type { AccountLinkStatus } from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';

/**
 * This is a state machine for managing the state of linking for a particular
 * account link.
 */
export default class LinkStateMachine {
  _accountLinkID: ID;
  _currentState: LinkState;
  _linkType: 'AUTO' | 'MANUAL';

  constructor(
    accountLinkID: ID,
    status: AccountLinkStatus,
    linkType: 'AUTO' | 'MANUAL',
  ) {
    this._accountLinkID = accountLinkID;
    this._currentState = new InitializingLinkState(this._accountLinkID, status);
    this._linkType = linkType;
  }

  initialize(): void {
    this._currentState.didEnterState(null, LinkEngine);
  }

  processEvent(event: LinkEvent): void {}

  getCurrentState(): LinkState {
    return this._currentState;
  }
}
