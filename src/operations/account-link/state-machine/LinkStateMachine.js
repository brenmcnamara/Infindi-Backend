/* @flow */

import InitializingState from './InitializingState';
import LinkEngine from './LinkEngine';

import invariant from 'invariant';

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
  _processingEventGuard: boolean = false;

  constructor(accountLinkID: ID, mode: LinkMode) {
    this._accountLinkID = accountLinkID;
    this._currentState = new InitializingState();
    this._mode = mode;

    this._currentState.setAccountLinkID(accountLinkID);
    this._currentState.setLinkMode(mode);
  }

  initialize(): void {
    LinkEngine.onLinkEvent(this._processEvent);
    this._currentState.didEnterState(null, LinkEngine);
  }

  _processEvent = (event: LinkEvent): void => {
    invariant(
      !this._processingEventGuard,
      'Recursive link event dispatches are not allowed',
    );
    this._processingEventGuard = true;
    const currentState = this.getCurrentState();
    const nextState = currentState.calculateNextState(event);
    if (currentState === nextState) {
      return;
    }

    nextState.setAccountLinkID(this._accountLinkID);
    nextState.setLinkMode(this._mode);

    currentState.willLeaveState(nextState, LinkEngine);
    this._currentState = nextState;
    nextState.didEnterState(currentState, LinkEngine);
    this._processingEventGuard = false;
  };

  getCurrentState(): LinkState {
    return this._currentState;
  }
}
