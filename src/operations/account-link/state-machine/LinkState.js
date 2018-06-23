/* @flow */

import invariant from 'invariant';

import type LinkEngine from './LinkEngine';

import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';
import type { LinkPayload } from './LinkStateMachine';

export default class LinkState {
  __accountLinkID: ID;
  __linkPayload: LinkPayload;

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

  setLinkPayload(payload: LinkPayload): void {
    this.__linkPayload = payload;
  }
}
