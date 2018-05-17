/* @flow */

import LinkState from './LinkState';
import LinkUtils from './LinkUtils';

import type {
  AccountLink,
  AccountLinkStatus,
} from 'common/lib/models/AccountLink';
import type { LinkEngineType } from './LinkEngine';
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
        this.__linkMode,
      );
    }
    return this;
  }

  didEnterState(fromState: LinkState | null, engine: LinkEngineType): void {
    engine.genSetAccountLinkStatus(this.__accountLinkID, this._targetStatus);

    this._pollingTimeout = setTimeout(() => {
      engine.genRefetchAccountLink(this.__accountLinkID);
    }, POLLING_DELAY_MS);
  }

  willLeaveState(): void {
    this._pollingTimeout && clearTimeout(this._pollingTimeout);
  }
}
