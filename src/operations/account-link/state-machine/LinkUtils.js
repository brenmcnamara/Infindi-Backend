/* @flow */

import ErrorState from './ErrorState';

import type LinkState from './LinkState';

import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';

function calculateStateForSuccessOrFailureEvent(
  accountLinkID: ID,
  event: LinkEvent,
): LinkState | null {
  if (event.type === 'ERROR') {
    return new ErrorState(accountLinkID, event.errorMessage);
  }
  // TODO: Handle link events for terminal link states.
  return null;
}

export default {
  calculateStateForSuccessOrFailureEvent,
};
