/* @flow */

import InitializingState from './InitializingState';
import LinkEngine from './LinkEngine';

import type LinkState from './LinkState';

import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';

export type LinkMode = 'AUTO' | 'MANUAL';

/**
 * This is a state machine for managing the state of linking for a particular
 * account link.
 */
export default class LinkStateMachine {
  _accountLinkID: ID;
  _currentState: LinkState;
  _mode: LinkMode;

  constructor(accountLinkID: ID, mode: LinkMode) {
    this._accountLinkID = accountLinkID;
    this._currentState = new InitializingState(this._accountLinkID);
    this._mode = mode;
  }

  initialize(): void {
    this._currentState.didEnterState(null, LinkEngine);
  }

  processEvent(event: LinkEvent): void {}

  getCurrentState(): LinkState {
    return this._currentState;
  }
}
