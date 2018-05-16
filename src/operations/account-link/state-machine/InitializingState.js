/* @flow */

import LinkState from './LinkState';
import PollingState from './PollingState';

import type { LinkEngineType } from './LinkEngine';
import type { LinkEvent } from './LinkEvent';

/**
 * Enter this state when starting the linking process.
 */
export default class InitializingState extends LinkState {
  calculateNextState(linkEvent: LinkEvent) {
    if (linkEvent.type === 'UPDATE_YODLEE_PROVIDER_ACCOUNT') {
      return new PollingState(linkEvent.providerAccount);
    }
    return this;
  }

  didEnterState(fromState: LinkState | null, engine: LinkEngineType): void {
    engine.genRefreshAccountLink(this.__accountLinkID);
  }
}
