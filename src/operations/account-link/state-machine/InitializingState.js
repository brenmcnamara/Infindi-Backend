/* @flow */

import LinkState from './LinkState';
import LinkTerminateWithoutUpdatingState from './LinkTerminateWithoutUpdatingState';
import LinkUtils from './LinkUtils';

import { INFO } from '../../../log-utils';

import type LinkEngine from './LinkEngine';

import type { LinkEvent } from './LinkEvent';

/**
 * Enter this state when starting the linking process.
 */
export default class InitializingState extends LinkState {
  _forceLinking: boolean;

  constructor(forceLinking: boolean) {
    super();
    this._forceLinking = forceLinking;
  }

  calculateNextState(linkEvent: LinkEvent) {
    const errorState = LinkUtils.calculateStateForSuccessOrFailureEvent(
      linkEvent,
    );
    if (errorState) {
      return errorState;
    }

    if (linkEvent.type === 'UPDATE_ACCOUNT_LINK') {
      const {accountLink} = linkEvent;
      if (!this._forceLinking && (accountLink.isLinking || accountLink.isInMFA)) {
        return new LinkTerminateWithoutUpdatingState();
      }

      return LinkUtils.calculateStateForUpdatedAccountLink(
        linkEvent.accountLink,
        this.__linkPayload,
      );
    }
    return this;
  }

  async didEnterState(
    fromState: LinkState | null,
    engine: LinkEngine,
  ): Promise<void> {
    INFO('ACCOUNT-LINK', 'New State: Initializing');
    await engine.genRefreshAccountLink();
    await engine.genRefetchAccountLink();
  }
}
