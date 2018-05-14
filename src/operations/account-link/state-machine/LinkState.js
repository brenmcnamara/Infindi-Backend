/* @flow */

import invariant from 'invariant';

import type { ID } from 'common/types/core';
import type { LinkEngineType } from './LinkEngine';
import type { LinkEvent } from './LinkEvent';

export default class LinkState {
  __accountLinkID: ID;

  constructor(accountLinkID: ID) {
    this.__accountLinkID = accountLinkID;
  }

  // ---------------------------------------------------------------------------
  //
  // MUST OVERRIDE
  //
  // ---------------------------------------------------------------------------

  calculateNextState(event: LinkEvent): LinkState {
    return invariant(
      false,
      'Expecting subclass of LinkState to override calculateNextState',
    );
  }

  // ---------------------------------------------------------------------------
  //
  // MAY OVERRIDE
  //
  // ---------------------------------------------------------------------------
  didEnterState(
    fromState: LinkState | null,
    engine: LinkEngineType,
  ): void | Promise<void> {}

  willLeaveState(
    toState: LinkState,
    engine: LinkEngineType,
  ): void | Promise<void> {}
}
