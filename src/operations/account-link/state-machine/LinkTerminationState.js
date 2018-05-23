/* @flow */

import LinkState from './LinkState';

import type LinkEngine from './LinkEngine';

import type {
  AccountLink,
  AccountLinkStatus,
} from 'common/lib/models/AccountLink';

/**
 * Enter this state when we are terminating the linking process for whatever
 * reason.
 */
export default class LinkTerminationState extends LinkState {
  _accountLink: AccountLink;
  _targetStatus: AccountLinkStatus;

  constructor(targetStatus: AccountLinkStatus) {
    super();
    this._targetStatus = targetStatus;
  }

  calculateNextState() {
    return this;
  }

  async didEnterState(
    fromState: LinkState | null,
    engine: LinkEngine,
  ): Promise<void> {
    await engine.genSetAccountLinkStatus(
      this.__accountLinkID,
      this._targetStatus,
    );

    engine.genLogEndLinking(this.__accountLinkID);
  }
}
