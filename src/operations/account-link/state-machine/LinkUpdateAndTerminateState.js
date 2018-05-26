/* @flow */

import LinkState from './LinkState';

import { updateAccountLinkStatus } from 'common/lib/models/AccountLink';

import type LinkEngine from './LinkEngine';

import type {
  AccountLink,
  AccountLinkStatus,
} from 'common/lib/models/AccountLink';

/**
 * Enter this state when we want to terminate the linking, but need to update
 * the state of the account link before doing so.
 */
export default class LinkUpdateAndTerminateState extends LinkState {
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

  async didEnterState(
    fromState: LinkState | null,
    engine: LinkEngine,
  ): Promise<void> {
    const accountLink = updateAccountLinkStatus(
      this._accountLink,
      this._targetStatus,
    );
    await engine.genSetAccountLink(accountLink);

    engine.genLogEndLinking();
  }
}
