/* @flow */

import LinkState from './LinkState';

import type { LinkEngineType } from './LinkEngine';

/**
 * Enter this state when we are terminating the linking process for whatever
 * reason.
 */
export default class TerminationLinkState extends LinkState {
  calculateNextState() {
    return this;
  }

  didEnterState(fromState: LinkState | null, engine: LinkEngineType): void {
    // Check for errors.
    // Log that we are done to link attempts.
    // Log anything to the console.
  }
}
