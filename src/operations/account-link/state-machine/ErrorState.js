/* @flow */

import LinkState from './LinkState';

import type { ID } from 'common/types/core';
import type { LinkEngineType } from './LinkEngine';
import type { LinkEvent } from './LinkEvent';

export default class ErrorState extends LinkState {
  _errorMessage: string;

  constructor(accountLinkID: ID, errorMessage: string) {
    super(accountLinkID);
    this._errorMessage = errorMessage;
  }

  calculateNextState(event: LinkEvent): LinkState {
    return this;
  }

  didEnterState(fromState: LinkState | null, engine: LinkEngineType): void {}
}
