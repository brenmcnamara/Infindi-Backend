/* @flow */

import InitializingState from './InitializingState';

import invariant from 'invariant';

import type LinkEngine from './LinkEngine';
import type LinkState from './LinkState';

import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';

export type LinkMode = 'FOREGROUND_UPDATE' | 'BACKGROUND_UPDATE';

/**
 * This is a state machine for managing the state of linking for a particular
 * account link.
 */
export default class LinkStateMachine {
  _accountLinkID: ID;
  _engine: LinkEngine;
  _currentState: LinkState;
  _mode: LinkMode;
  _processingEventGuard: boolean = false;

  constructor(accountLinkID: ID, mode: LinkMode, engine: LinkEngine) {
    this._accountLinkID = accountLinkID;
    this._currentState = new InitializingState();
    this._engine = engine;
    this._mode = mode;

    this._currentState.setAccountLinkID(accountLinkID);
    this._currentState.setLinkMode(mode);
  }

  initialize(): void {
    this._engine.onLinkEvent(this._processEvent);
    this._currentState.didEnterState(null, this._engine);
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

    currentState.willLeaveState(nextState, this._engine);
    this._currentState = nextState;
    nextState.didEnterState(currentState, this._engine);
    this._processingEventGuard = false;
  };

  getCurrentState(): LinkState {
    return this._currentState;
  }
}
