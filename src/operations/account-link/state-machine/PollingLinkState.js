/* @flow */

import LinkState from './LinkState';

import type { ID } from 'common/types/core';
import type { LinkEngineType } from './LinkEngine';
import type { LinkEvent } from './LinkEvent';
import type { LinkMode } from './LinkStateMachine';

export default class PollingState extends LinkState {
  _mode: LinkMode;

  constructor(accountLinkID: ID, mode: LinkMode) {
    super(accountLinkID);
    this._mode = mode;
  }

  calculateNextState(linkEvent: LinkEvent): LinkState {
    return new PollingState(this.__accountLinkID, this._mode);
  }

  willEnterState(engine: LinkEngineType): void {
    engine.genRefetchAccountLink(this.__accountLinkID);
  }
}
