/* @flow */

import AccountLinkMutator from 'common/lib/models/AccountLinkMutator';
import LinkState from './LinkState';
import LinkUtils from './LinkUtils';

import { INFO } from '../../../log-utils';

import type AccountLink, {
  AccountLinkStatus,
} from 'common/lib/models/AccountLink';
import type LinkEngine from './LinkEngine';

import type { LinkEvent } from './LinkEvent';

const POLLING_DELAY_MS = 2000;

export default class PollingState extends LinkState {
  _accountLink: AccountLink;
  _pollingTimeout: ?TimeoutID = null;
  _targetStatus: AccountLinkStatus;

  constructor(accountLink: AccountLink, targetStatus: AccountLinkStatus) {
    super();
    this._accountLink = accountLink;
    this._targetStatus = targetStatus;
  }

  calculateNextState(linkEvent: LinkEvent): LinkState {
    const errorState = LinkUtils.calculateStateForSuccessOrFailureEvent(
      linkEvent,
    );
    if (errorState) {
      return errorState;
    }

    if (linkEvent.type === 'UPDATE_ACCOUNT_LINK') {
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
    INFO('ACCOUNT-LINK', 'New State: Polling');
    const accountLink = this._accountLink.setStatus(this._targetStatus);

    this._pollingTimeout = setTimeout(() => {
      engine.genRefetchAccountLink();
    }, POLLING_DELAY_MS);

    await AccountLinkMutator.genSet(accountLink);
  }

  willLeaveState(): void {
    this._pollingTimeout && clearTimeout(this._pollingTimeout);
  }
}
