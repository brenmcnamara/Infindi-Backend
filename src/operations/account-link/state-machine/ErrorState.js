/* @flow */

import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkMutator from 'common/lib/models/AccountLinkMutator';

import LinkState from './LinkState';

import { INFO } from '../../../log-utils';

import type LinkEngine from './LinkEngine';

import type { LinkEvent } from './LinkEvent';

export default class ErrorState extends LinkState {
  _errorMessage: string;

  constructor(errorMessage: string) {
    super();
    this._errorMessage = errorMessage;
  }

  calculateNextState(event: LinkEvent): LinkState {
    return this;
  }

  async didEnterState(
    fromState: LinkState | null,
    engine: LinkEngine,
  ): Promise<void> {
    INFO('ACCOUNT-LINK', 'New State: Error State');

    const accountLink = await AccountLinkFetcher.genNullthrows(
      this.__accountLinkID,
    );
    AccountLinkMutator.genSet(
      accountLink.setStatus('FAILURE / INTERNAL_SERVICE_FAILURE'),
    );
  }
}
