/* @flow */

import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkMutator from 'common/lib/models/AccountLinkMutator';

import LinkState from './LinkState';

import { INFO } from '../../../log-utils';

import type FindiError from 'common/lib/FindiError';
import type LinkEngine from './LinkEngine';

import type { LinkEvent } from './LinkEvent';

export default class ErrorState extends LinkState {
  _error: FindiError;

  constructor(error: FindiError) {
    super();
    this._error = error;
  }

  calculateNextState(event: LinkEvent): LinkState {
    return this;
  }

  async didEnterState(
    fromState: LinkState | null,
    engine: LinkEngine,
  ): Promise<void> {
    INFO(
      'ACCOUNT-LINK',
      `LinkID=${this.__accountLinkID} New State: Error State`,
    );

    const accountLink = await AccountLinkFetcher.genNullthrows(
      this.__accountLinkID,
    );
    AccountLinkMutator.genSet(
      accountLink.setStatus('FAILURE / INTERNAL_SERVICE_FAILURE'),
    );
  }
}
