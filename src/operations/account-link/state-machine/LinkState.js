/* @flow */

import invariant from 'invariant';

import type LinkEngine from './LinkEngine';

import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';
import type { LinkMode } from './LinkStateMachine';

export default class LinkState {
  __accountLinkID: ID;
  __linkMode: LinkMode;

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
    engine: LinkEngine,
  ): void | Promise<void> {}

  willLeaveState(
    toState: LinkState,
    engine: LinkEngine,
  ): void | Promise<void> {}

  // ---------------------------------------------------------------------------
  //
  // DO NOT OVERRIDE
  //
  // ---------------------------------------------------------------------------
  setAccountLinkID(id: ID): void {
    this.__accountLinkID = id;
  }

  setLinkMode(mode: LinkMode): void {
    this.__linkMode = mode;
  }
}
