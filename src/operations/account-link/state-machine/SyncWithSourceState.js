/* @flow */

import LinkState from './LinkState';
import LinkUtils from './LinkUtils';

import type LinkEngine from './LinkEngine';

import type AccountLink from 'common/lib/models/AccountLink';

import type { LinkEvent } from './LinkEvent';

/**
 * Enter this state when we are ready to sync the source of truth of the
 * link to the internal datastores (i.e. Download yodlee data into firebase).
 */
export default class SyncWithSourceState extends LinkState {
  _accountLink: AccountLink;

  constructor(accountLink: AccountLink) {
    super();
    this._accountLink = accountLink;
  }

  calculateNextState(event: LinkEvent): LinkState {
    const state = LinkUtils.calculateStateForSuccessOrFailureEvent(event);
    if (state) {
      return state;
    }
    return this;
  }

  async didEnterState(
    fromState: LinkState | null,
    engine: LinkEngine,
  ): Promise<void> {
    await engine.genSetAccountLinkStatus(
      'IN_PROGRESS / DOWNLOADING_FROM_SOURCE',
    );
    // TODO: IMPLEMENT DOWNLOADING LOGIC!
  }
}
