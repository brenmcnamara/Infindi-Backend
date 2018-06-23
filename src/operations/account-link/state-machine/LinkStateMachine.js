/* @flow */

import InitializingState from './InitializingState';

import invariant from 'invariant';

import { ERROR } from '../../../log-utils';

import type LinkEngine from './LinkEngine';
import type LinkState from './LinkState';

import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';
import type { LoginForm as YodleeLoginForm } from 'common/types/yodlee-v1.0';

export type LinkPayload =
  | {| +type: 'FOREGROUND_UPDATE' | 'BACKGROUND_UPDATE' |}
  | {| +loginForm: YodleeLoginForm, +type: 'PERFORM_LOGIN' |};

export type StateMachineProps = {
  +accountLinkID: ID,
  +engine: LinkEngine,
  +payload: LinkPayload,
  +shouldForceLinking?: boolean,
};

type StateMachinePropsFull = {
  +accountLinkID: ID,
  +engine: LinkEngine,
  +payload: LinkPayload,
  +shouldForceLinking: boolean,
};

/**
 * This is a state machine for managing the state of linking for a particular
 * account link.
 */
export default class LinkStateMachine {
  _props: StateMachinePropsFull;
  _currentState: LinkState;
  _processingEventGuard: boolean = false;

  static reconcileProps(props: StateMachineProps): StateMachinePropsFull {
    return {
      ...props,
      shouldForceLinking: props.shouldForceLinking || false,
    };
  }

  constructor(props: StateMachineProps) {
    const fullProps = LinkStateMachine.reconcileProps(props);
    const currentState = new InitializingState(fullProps.shouldForceLinking);

    currentState.setAccountLinkID(props.accountLinkID);
    currentState.setLinkPayload(props.payload);

    this._props = fullProps;
    this._currentState = currentState;
  }

  initialize(): void {
    this._props.engine.onLinkEvent(this._processEvent);
    this._currentState.didEnterState(null, this._props.engine);
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

    nextState.setAccountLinkID(this._props.accountLinkID);
    nextState.setLinkPayload(this._props.payload);

    this._wrapInErrorHandler(() =>
      currentState.willLeaveState(nextState, this._props.engine),
    );
    this._currentState = nextState;
    this._wrapInErrorHandler(() =>
      nextState.didEnterState(currentState, this._props.engine),
    );
    this._processingEventGuard = false;
  };

  getCurrentState(): LinkState {
    return this._currentState;
  }

  _wrapInErrorHandler(handler: () => Promise<void> | void): void {
    let result;
    try {
      result = handler();
    } catch (error) {
      this._handleCaughtError(error);
    }

    if (result instanceof Promise) {
      result.catch(error => {
        this._handleCaughtError(error);
      });
    }
  }

  _handleCaughtError(error: mixed): void {
    // $FlowFixMe - This is fine
    ERROR('ACCOUNT-LINK', `Error caught by link state machine\n${error.stack}`);

    if (this._processingEventGuard) {
      ERROR(
        'ACCOUNT-LINK',
        // eslint-disable-next-line max-len
        'An error was thrown in the middle of transitioning from one state to another. This should never happen. Check willLeaveState and didEnterState of the Link States',
      );
      this._processingEventGuard = false;
    }

    // $FlowFixMe - This is correct
    const errorMessage: string =
      error && typeof error === 'object'
        ? error.message || error.errorMessage || error.toString()
        : typeof error === 'string' ? error : 'Unknown error';

    this._props.engine.sendEvent({
      errorType: 'INTERNAL',
      errorMessage,
      type: 'ERROR',
    });
  }
}
