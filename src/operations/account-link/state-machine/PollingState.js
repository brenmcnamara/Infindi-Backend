/* @flow */

import LinkState from './LinkState';
import LinkUtils from './LinkUtils';

import invariant from 'invariant';

import type {
  AccountLink,
  AccountLinkStatus,
} from 'common/lib/models/AccountLink';
import type { LinkEngineType } from './LinkEngine';
import type { LinkEvent } from './LinkEvent';
import type { LinkMode } from './LinkStateMachine';

const POLLING_DELAY_MS = 2000;

export default class PollingState extends LinkState {
  _accountLink: AccountLink;
  _pollingTimeout: ?TimeoutID = null;
  _targetAccountLinkStatus: AccountLinkStatus;

  static calculateAccountLinkStatus(
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
          ? linkMode === 'MANUAL'
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
    return 'SUCCESS';
  }

  constructor(accountLink: AccountLink) {
    super();
    this._accountLink = accountLink;
  }

  calculateNextState(linkEvent: LinkEvent): LinkState {
    const errorState = LinkUtils.calculateStateForSuccessOrFailureEvent(
      linkEvent,
    );
    if (errorState) {
      return errorState;
    }

    if (linkEvent.type === 'UPDATE_ACCOUNT_LINK') {
      return new PollingState(linkEvent.accountLink);
    }
    return this;
  }

  didEnterState(fromState: LinkState | null, engine: LinkEngineType): void {
    const status = PollingState.calculateAccountLinkStatus(
      this._accountLink,
      this.__linkMode,
    );
    engine.genSetAccountLinkStatus(this.__accountLinkID, status);

    this._pollingTimeout = setTimeout(() => {
      engine.genRefetchAccountLink(this.__accountLinkID);
    }, POLLING_DELAY_MS);
  }

  willLeaveState(): void {
    this._pollingTimeout && clearTimeout(this._pollingTimeout);
  }
}
