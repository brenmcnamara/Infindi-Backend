/* @flow */

import LinkState from './LinkState';

import type { LinkEngineType } from './LinkEngine';

/**
 * Enter this state when we are terminating the linking process for whatever
 * reason.
 */
export default class LinkTerminationState extends LinkState {
  calculateNextState() {
    return this;
  }

  didEnterState(fromState: LinkState | null, engine: LinkEngineType): void {}
}
