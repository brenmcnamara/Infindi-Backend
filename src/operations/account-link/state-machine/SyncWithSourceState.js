/* @flow */

import LinkState from './LinkState';
import LinkUtils from './LinkUtils';

import type LinkEngine from './LinkEngine';

import type { LinkEvent } from './LinkEvent';

/**
 * Enter this state when we are ready to sync the source of truth of the
 * link to the internal datastores (i.e. Download yodlee data into firebase).
 */
export default class SyncWithSourceState extends LinkState {
  calculateNextState(event: LinkEvent): LinkState {
    const state = LinkUtils.calculateStateForSuccessOrFailureEvent(event);
    if (state) {
      return state;
    }
    return this;
  }

  didEnterState(fromState: LinkState | null, engine: LinkEngine): void {
    // TODO: IMPLEMENT DOWNLOADING LOGIC!
    engine.genSetAccountLinkStatus(
      this.__accountLinkID,
      'IN_PROGRESS / DOWNLOADING_FROM_SOURCE',
    );
  }
}
