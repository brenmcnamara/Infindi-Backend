/* @flow */

import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import LinkState from './LinkState';
import LinkTerminateWithoutUpdatingState from './LinkTerminateWithoutUpdatingState';
import LinkUtils from './LinkUtils';
import ProviderFetcher from 'common/lib/models/ProviderFetcher';
import YodleeManager from '../../../yodlee/YodleeManager-V1.0';

import invariant from 'invariant';

import { INFO } from '../../../log-utils';

import type LinkEngine from './LinkEngine';

import type { LinkEvent } from './LinkEvent';

/**
 * Enter this state when starting the linking process.
 */
// TODO: Need to detect blank form and automatically dispatch an invalid
// credentials state. Blank forms being sent through the yodlee api will
// result in errors being thrown, which will put us in some unknown error state.
export default class InitializingState extends LinkState {
  _forceLinking: boolean;

  constructor(forceLinking: boolean) {
    super();
    this._forceLinking = forceLinking;
  }

  calculateNextState(linkEvent: LinkEvent) {
    const errorState = LinkUtils.calculateStateForSuccessOrFailureEvent(
      linkEvent,
    );
    if (errorState) {
      return errorState;
    }

    if (linkEvent.type === 'UPDATE_ACCOUNT_LINK') {
      const { accountLink } = linkEvent;
      if (
        !this._forceLinking &&
        this.__linkPayload.type !== 'PERFORM_LOGIN' &&
        (accountLink.isLinking || accountLink.isInMFA)
      ) {
        return new LinkTerminateWithoutUpdatingState();
      }

      return LinkUtils.calculateStateForUpdatedAccountLink(
        linkEvent.accountLink,
        this.__linkPayload,
      );
    }
    return this;
  }

  async didEnterState(
    fromState: LinkState | null,
    engine: LinkEngine,
  ): Promise<void> {
    INFO(
      'ACCOUNT-LINK',
      `LinkID=${this.__accountLinkID} New State: Initializing`,
    );

    const linkPayload = this.__linkPayload;

    if (linkPayload.type === 'PERFORM_LOGIN') {
      // STEP 1A: If we are logging in to a provider, send the login form to
      // the source of truth.

      const [userID, accountLink] = await Promise.all([
        engine.genFetchUserID(),
        AccountLinkFetcher.genNullthrows(this.__accountLinkID),
      ]);

      const { sourceOfTruth } = await ProviderFetcher.genNullthrows(
        accountLink.providerRef.refID,
      );

      invariant(
        sourceOfTruth.type === 'YODLEE',
        'Expecting provider to come from yodlee: %s',
        accountLink.providerRef.refID,
      );

      const yodleeProvider = {
        ...sourceOfTruth.value,
        loginForm: linkPayload.loginForm,
      };

      const response = await YodleeManager.genProviderLogin(
        userID,
        yodleeProvider,
      );
      engine.setProviderAccountID(String(response.providerAccountId));
    } else {
      // STEP 1B: If we are not logging in, assume that we are resyncing the
      // data of the account with an existing account.

      await engine.genRefreshAccountLink();
    }

    // STEP 2: Get the updated account link data from the source and sync it
    // with the data.
    await engine.genRefetchAccountLink();
  }
}
