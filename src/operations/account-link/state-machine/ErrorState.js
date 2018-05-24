/* @flow */

import LinkState from './LinkState';

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
    await engine.genSetAccountLinkStatus('FAILURE / INTERNAL_SERVICE_FAILURE');
    engine.genLogEndLinking();
  }
}
