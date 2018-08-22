/* @flow */

import ErrorState from './ErrorState';
import LinkTerminateWithoutUpdatingState from './LinkTerminateWithoutUpdatingState';
import LinkUpdateAndTerminateState from './LinkUpdateAndTerminateState';
import PollingState from './PollingState';
import SyncWithSourceState from './SyncWithSourceState';

import invariant from 'invariant';

import type AccountLink, {
  AccountLinkStatus,
} from 'common/lib/models/AccountLink';
import type LinkState from './LinkState';

import type { LinkEvent } from './LinkEvent';
import type { LinkPayload } from './LinkStateMachine';

function calculateStateForSuccessOrFailureEvent(
  event: LinkEvent,
): LinkState | null {
  switch (event.type) {
    case 'ERROR':
      return new ErrorState(event.error);

    case 'FORCE_TERMINATE_LINKING':
      return new LinkTerminateWithoutUpdatingState();
  }
  return null;
}

function calculateStateForUpdatedAccountLink(
  accountLink: AccountLink,
  linkPayload: LinkPayload,
): LinkState {
  const status = calculateAccountLinkStatus(accountLink, linkPayload);
  switch (status) {
    case 'FAILURE / BAD_CREDENTIALS':
    case 'FAILURE / EXTERNAL_SERVICE_FAILURE':
    case 'FAILURE / INTERNAL_SERVICE_FAILURE':
    case 'FAILURE / MFA_FAILURE':
    case 'FAILURE / TIMEOUT':
    case 'FAILURE / USER_INPUT_REQUEST_IN_BACKGROUND':
    case 'SUCCESS':
      return new LinkUpdateAndTerminateState(accountLink, status);

    case 'EMPTY':
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
  linkPayload: LinkPayload,
): AccountLinkStatus {
  const { sourceOfTruth } = accountLink;

  if (sourceOfTruth.type === 'EMPTY') {
    return 'EMPTY';
  }

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
      : // NOTE: Sometimes, yodlee has the USER_INPUT_REQUIRED status but
        // still manages to login without a login form. We will check for
        // foreground updates only after we are provided a login form, indicating
        // that we need user intervention for sure.
        refreshInfo.additionalStatus === 'USER_INPUT_REQUIRED'
        ? loginForm
          ? linkPayload.type === 'FOREGROUND_UPDATE'
            ? 'MFA / PENDING_USER_INPUT'
            : 'FAILURE / USER_INPUT_REQUEST_IN_BACKGROUND'
          : 'MFA / WAITING_FOR_LOGIN_FORM'
        : 'IN_PROGRESS / DOWNLOADING_DATA';
  }
  if (refreshInfo.status === 'FAILED') {
    if (refreshInfo.statusMessage === 'INTERNAL_ERROR') {
      return 'FAILURE / EXTERNAL_SERVICE_FAILURE';
    }

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
        : refreshInfo.additionalStatus === 'REQUEST_TIME_OUT'
          ? 'FAILURE / TIMEOUT'
          : isStatusCodeExternalServiceFailure(refreshInfo.statusCode)
            ? 'FAILURE / EXTERNAL_SERVICE_FAILURE'
            : 'FAILURE / INTERNAL_SERVICE_FAILURE';
  }
  return 'IN_PROGRESS / DOWNLOADING_FROM_SOURCE';
}

function isStatusCodeExternalServiceFailure(statusCode: ?number): boolean {
  if (typeof statusCode !== 'number') {
    return false;
  }
  // You can find status codes here:
  // https://developer.yodlee.com/Data_Model/Resource_Provider_Accounts
  return statusCode >= 400 && statusCode < 800;
}

export default {
  calculateStateForSuccessOrFailureEvent,
  calculateStateForUpdatedAccountLink,
};
