/* @flow */

import LinkState from './LinkState';
import LinkUtils from './LinkUtils';
import PollingState from './PollingState';

import type { LinkEngineType } from './LinkEngine';
import type { LinkEvent } from './LinkEvent';

/**
 * Enter this state when starting the linking process.
 */
export default class InitializingState extends LinkState {
  calculateNextState(linkEvent: LinkEvent) {
    const errorState = LinkUtils.calculateStateForSuccessOrFailureEvent(
      linkEvent,
    );
    if (errorState) {
      return errorState;
    }

    if (linkEvent.type === 'UPDATE_ACCOUNT_LINK') {
      return new PollingState(linkEvent.accountLink);
    }
    return this;
  }

  didEnterState(fromState: LinkState | null, engine: LinkEngineType): void {
    engine.genRefreshAccountLink(this.__accountLinkID);
  }
}
