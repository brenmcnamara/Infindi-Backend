/* @flow */

import LinkState from './LinkState';

import type { LinkEngineType } from './LinkEngine';
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
    engine: LinkEngineType,
  ): Promise<void> {
    await engine.genSetAccountLinkStatus(
      this.__accountLinkID,
      'FAILURE / INTERNAL_SERVICE_FAILURE',
    );
    engine.genLogEndLinking(this.__accountLinkID);
  }
}
