/* @flow */

import ErrorState from './ErrorState';

import type LinkState from './LinkState';

import type { LinkEvent } from './LinkEvent';

function calculateStateForSuccessOrFailureEvent(
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
