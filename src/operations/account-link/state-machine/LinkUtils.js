/* @flow */

import ErrorState from './ErrorState';
import LinkTerminateWithoutUpdatingState from './LinkTerminateWithoutUpdatingState';
import LinkUpdateAndTerminateState from './LinkUpdateAndTerminateState';
import PollingState from './PollingState';
import SyncWithSourceState from './SyncWithSourceState';

import invariant from 'invariant';

import type LinkState from './LinkState';

import type {
  AccountLink,
  AccountLinkStatus,
} from 'common/lib/models/AccountLink';
import type { LinkEvent } from './LinkEvent';
import type { LinkMode } from './LinkStateMachine';

function calculateStateForSuccessOrFailureEvent(
  event: LinkEvent,
): LinkState | null {
  switch (event.type) {
    case 'ERROR':
      return new ErrorState(event.errorMessage);

    case 'FORCE_TERMINATE_LINKING':
      return new LinkTerminateWithoutUpdatingState();
  }
  return null;
}

function calculateStateForUpdatedAccountLink(
  accountLink: AccountLink,
  linkMode: LinkMode,
): LinkState {
  const status = calculateAccountLinkStatus(accountLink, linkMode);
  switch (status) {
    case 'FAILURE / BAD_CREDENTIALS':
    case 'FAILURE / EXTERNAL_SERVICE_FAILURE':
    case 'FAILURE / INTERNAL_SERVICE_FAILURE':
    case 'FAILURE / MFA_FAILURE':
    case 'FAILURE / USER_INPUT_REQUEST_IN_BACKGROUND':
    case 'SUCCESS':
      return new LinkUpdateAndTerminateState(accountLink, status);

    case 'IN_PROGRESS / DOWNLOADING_DATA':
    case 'IN_PROGRESS / INITIALIZING':
    case 'IN_PROGRESS / VERIFYING_CREDENTIALS':
    case 'MFA / PENDING_USER_INPUT':
    case 'MFA / WAITING_FOR_LOGIN_FORM':
      return new PollingState(accountLink, status);

    case 'IN_PROGRESS / DOWNLOADING_FROM_SOURCE':
      return new SyncWithSourceState(accountLink);

    default:
      return invariant(false, 'Unhandled account link status: %s', status);
  }
}

function calculateAccountLinkStatus(
  accountLink: AccountLink,
  linkMode: LinkMode,
): AccountLinkStatus {
  const { sourceOfTruth } = accountLink;
  invariant(
    sourceOfTruth.type === 'YODLEE',
    'Expecting account link source of truth to come from YODLEE',
  );
  const { refreshInfo } = sourceOfTruth.providerAccount;
  const { loginForm } = sourceOfTruth;

  if (!refreshInfo.status) {
    return 'IN_PROGRESS / INITIALIZING';
  }
  if (refreshInfo.status === 'IN_PROGRESS') {
    return refreshInfo.additionalStatus === 'LOGIN_IN_PROGRESS'
      ? 'IN_PROGRESS / VERIFYING_CREDENTIALS'
      : refreshInfo.additionalStatus === 'USER_INPUT_REQUIRED'
        ? linkMode === 'FOREGROUND_UPDATE'
          ? loginForm
            ? 'MFA / PENDING_USER_INPUT'
            : 'MFA / WAITING_FOR_LOGIN_FORM'
          : 'FAILURE / USER_INPUT_REQUEST_IN_BACKGROUND'
        : 'IN_PROGRESS / DOWNLOADING_DATA';
  }
  if (refreshInfo.status === 'FAILED') {
    const isMFAFailure =
      refreshInfo.statusMessage ===
      'MFA_INFO_NOT_PROVIDED_IN_REAL_TIME_BY_USER_VIA_APP';
    // NOTE: isLoginFailure is true during an MFA failure. Need to check
    // MFA failure first.
    const isLoginFailure = refreshInfo.additionalStatus === 'LOGIN_FAILED';
    return isMFAFailure
      ? 'FAILURE / MFA_FAILURE'
      : isLoginFailure
        ? 'FAILURE / BAD_CREDENTIALS'
        : 'FAILURE / INTERNAL_SERVICE_FAILURE';
  }
  return 'IN_PROGRESS / DOWNLOADING_FROM_SOURCE';
}

export default {
  calculateStateForSuccessOrFailureEvent,
  calculateStateForUpdatedAccountLink,
};
