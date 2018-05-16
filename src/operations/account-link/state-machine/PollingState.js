/* @flow */

import LinkState from './LinkState';

import type { LinkEngineType } from './LinkEngine';
import type { LinkEvent } from './LinkEvent';
import type { ProviderAccount as YodleeProviderAccount } from 'common/types/yodlee-v1.0';

const POLLING_DELAY_MS = 2000;

export default class PollingState extends LinkState {
  _pollingTimeout: ?TimeoutID = null;
  _providerAccount: YodleeProviderAccount;

  constructor(providerAccount: YodleeProviderAccount) {
    super();
    this._providerAccount = providerAccount;
  }

  calculateNextState(linkEvent: LinkEvent): LinkState {
    if (linkEvent.type === 'UPDATE_YODLEE_PROVIDER_ACCOUNT') {
      return new PollingState(linkEvent.providerAccount);
    }
    return this;
  }

  didEnterState(fromState: LinkState | null, engine: LinkEngineType): void {
    this._pollingTimeout = setTimeout(() => {
      engine.genRefetchAccountLink(this.__accountLinkID);
    }, POLLING_DELAY_MS);
  }

  willLeaveState(): void {
    this._pollingTimeout && clearTimeout(this._pollingTimeout);
  }
}
