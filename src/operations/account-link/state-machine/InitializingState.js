/* @flow */

import LinkState from './LinkState';
import LinkTerminateWithoutUpdatingState from './LinkTerminateWithoutUpdatingState';
import LinkUtils from './LinkUtils';

import { INFO } from '../../../log-utils';
import { isLinking } from 'common/lib/models/AccountLink';

import type LinkEngine from './LinkEngine';

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
      const { accountLink } = linkEvent;
      if (isLinking(accountLink)) {
        return new LinkTerminateWithoutUpdatingState();
      }
      return LinkUtils.calculateStateForUpdatedAccountLink(
        linkEvent.accountLink,
        this.__linkMode,
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
