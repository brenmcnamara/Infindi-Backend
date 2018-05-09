/* @flow */

import type { AccountLink } from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';

type LinkState = LinkState$Error | LinkState$Initializing | LinkState$Success;

type LinkState$Initializing = {
  type: 'INITIALIZING',
};

type LinkState$Error = {
  errorType: string,
  type: 'ERROR',
};

type LinkState$Success = {
  type: 'SUCCESS',
};

type LinkEvent = LinkEvent$Error | LinkEvent$UpdateAccountLink;

type LinkEvent$UpdateAccountLink = {
  accountLink: AccountLink,
  type: 'UPDATE_ACCOUNT_LINK',
};

type LinkEvent$Error = {
  errorType: 'INTERNAL' | 'EXTERNAL',
  errorMessage: string,
  type: 'ERROR',
};

/**
 * This is a state machine for managing the state of linking for a particular
 * account link.
 */
export default class LinkStateMachine {
  _accountLinkID: ID;
  _currentState: LinkState = { type: 'INITIALIZING' };
  _linkType: 'AUTO' | 'MANUAL';

  static calculateNextState(
    event: LinkEvent,
    currentState: LinkState,
  ): LinkState {
    if (event.type === 'ERROR') {
      return {
        errorType: event.errorType,
        type: 'ERROR',
      };
    }
    return currentState;
  }

  constructor(accountLinkID: ID, linkType: 'AUTO' | 'MANUAL') {
    this._accountLinkID = accountLinkID;
    this._linkType = linkType;
  }

  getCurrentState(): LinkState {
    return this._currentState;
  }
}
