/* @flow */

import ErrorState from './ErrorState';

import type LinkState from './LinkState';

import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';
import type { LinkMode } from './LinkStateMachine';

function calculateStateForSuccessOrFailureEvent(
  accountLinkID: ID,
  mode: LinkMode,
  event: LinkEvent,
): LinkState | null {
  if (event.type === 'ERROR') {
    return new ErrorState(event.errorMessage);
  }
  // TODO: Handle link events for terminal link states.
  return null;
}

export default {
  calculateStateForSuccessOrFailureEvent,
};
