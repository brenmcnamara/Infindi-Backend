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

  didEnterState(fromState: LinkState | null, engine: LinkEngineType): void {}
}
