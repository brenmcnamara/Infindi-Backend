/* @flow */

import LinkState from './LinkState';

import { INFO } from '../../../log-utils';

import type { LinkEvent } from './LinkEvent';

/**
 * Successfully terminate the linking process.
 */
export default class LinkTerminateWithoutUpdatingState extends LinkState {
  calculateNextState(event: LinkEvent): LinkState {
    return this;
  }

  didEnterState(): void {
    INFO('ACCOUNT-LINK', 'New State: LinkTerminateWithoutUpdating');
  }
}
