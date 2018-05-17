/* @flow */

import LinkState from './LinkState';

import type {
  AccountLink,
  AccountLinkStatus,
} from 'common/lib/models/AccountLink';
import type { LinkEngineType } from './LinkEngine';

/**
 * Enter this state when we are terminating the linking process for whatever
 * reason.
 */
export default class LinkTerminationState extends LinkState {
  _accountLink: AccountLink;
  _targetStatus: AccountLinkStatus;

  constructor(accountLink: AccountLink, targetStatus: AccountLinkStatus) {
    super();
    this._accountLink = accountLink;
    this._targetStatus = targetStatus;
  }

  calculateNextState() {
    return this;
  }

  didEnterState(fromState: LinkState | null, engine: LinkEngineType): void {
    engine.genSetAccountLinkStatus(this.__accountLinkID, this._targetStatus);
  }
}
