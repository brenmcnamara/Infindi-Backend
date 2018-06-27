/* @flow */

import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';

import invariant from 'invariant';

import { ERROR } from '../../../log-utils';
import {
  genProviderAccount,
  genProviderAccountRefresh,
} from '../../../yodlee/yodlee-manager';

import type AccountLink from 'common/lib/models/AccountLink';

import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';

export type EventEmitter = { remove: () => void };
export type LinkEventCallback = (event: LinkEvent) => void;

export default class LinkEngine {
  _accountLinkID: ID;
  _linkEventCallback: LinkEventCallback | null = null;
  _providerAccountID: ID | null = null;
  _userID: ID | null = null;

  constructor(accountLinkID: ID) {
    this._accountLinkID = accountLinkID;
  }

  // NOTE: Temporary workaround for login flow, until we move some of these
  // methods out.
  setProviderAccountID(providerAccountID: ID): void {
    this._providerAccountID = providerAccountID;
  }

  /**
   * Signals the source of truth that it is time to start updating the account
   * link.
   */
  async genRefreshAccountLink(): Promise<void> {
    await this._errorHandlerAsync(async () => {
      // Want to get the userID and providerID in sequence because when fetching
      // one of them, we fetch the other value as well. If we run them in
      // parallel, we may end up making an extra network call.
      const userID = await this.genFetchUserID();
      const providerAccountID = await this._genFetchProviderAccountID();
      await genProviderAccountRefresh(userID, providerAccountID);
    });
  }

  /**
   * Refetches the account link from the source of truth.
   */
  async genRefetchAccountLink(): Promise<void> {
    await this._errorHandlerAsync(async () => {
      let accountLink = await this._genFetchAccountLink();
      const userID = await this.genFetchUserID();
      const providerAccountID = await this._genFetchProviderAccountID();
      const providerAccount = await genProviderAccount(
        userID,
        providerAccountID,
      );
      if (!providerAccount) {
        const errorCode = 'infindi/resource-not-found';
        const errorMessage = `Could not find providerAccount for id: ${providerAccountID}`;
        const toString = `[${errorCode}]: ${errorMessage}`;
        throw { errorCode, errorMessage, toString };
      }
      // TODO: Should we send this to firebase at this point? Need to get
      // the updates account link state from the link state.
      accountLink = accountLink.setYodlee(providerAccount);
      this.sendEvent({ accountLink, type: 'UPDATE_ACCOUNT_LINK' });
    });
  }

  forceTerminateTerminateLinking() {
    this.sendEvent({ type: 'FORCE_TERMINATE_LINKING' });
  }

  onLinkEvent(cb: LinkEventCallback): EventEmitter {
    this._linkEventCallback = cb;
    return {
      remove: () => {
        this._linkEventCallback = null;
      },
    };
  }

  sendEvent(linkEvent: LinkEvent): void {
    this._linkEventCallback && this._linkEventCallback(linkEvent);
  }

  async _genFetchAccountLink(): Promise<AccountLink> {
    // STEP 1: Fetch the account link. Error out if it does not exist.

    const accountLinkID = this._accountLinkID;
    const accountLink = await AccountLinkFetcher.gen(this._accountLinkID);
    if (!accountLink) {
      const errorCode = 'infindi/resource-not-found';
      const errorMessage = `Could not find account link: ${accountLinkID}`;
      const toString = `[${errorCode}]: ${errorMessage}`;
      throw { errorCode, errorMessage, toString };
    }

    // STEP 2: Update any locale caches based on the account link.

    this._userID = accountLink.userRef.refID;

    const { sourceOfTruth } = accountLink;
    switch (sourceOfTruth.type) {
      case 'EMPTY': {
        break;
      }

      case 'YODLEE': {
        const { providerAccount } = sourceOfTruth;
        this._providerAccountID = String(providerAccount.id);
        break;
      }

      default: {
        invariant(
          false,
          'Unexpected account link source of truth: %s',
          sourceOfTruth.type,
        );
      }
    }

    return accountLink;
  }

  async _genFetchProviderAccountID(): Promise<ID> {
    if (!this._providerAccountID) {
      await this._genFetchAccountLink();
    }
    invariant(
      this._providerAccountID,
      'Expecting _genFetchAccountLink to cache providerAccountID',
    );
    return this._providerAccountID;
  }

  async genFetchUserID(): Promise<ID> {
    if (!this._userID) {
      await this._genFetchAccountLink();
    }
    invariant(this._userID, 'Expecting _genFetchAccountLink to cache userID');
    return this._userID;
  }

  _errorHandlerAsync(cb: () => Promise<void>): Promise<void> {
    return cb().catch(error => {
      // TODO: Proper error detection here. Where is the error coming from?
      // Is there anything from the error that we can parse out to discover
      // what kind of error it is?
      const linkEvent = {
        errorType: 'INTERNAL',
        errorMessage: error.toString(),
        type: 'ERROR',
      };
      ERROR('ACCOUNT-LINK', error.toString());
      // TODO: Should not be calling private method from outside scope.
      this.sendEvent(linkEvent);
    });
  }

  _errorSwallowerAsync(cb: () => Promise<void>): Promise<void> {
    return cb().catch(error => {
      // TODO: Propert error message extraction.
      const errorMessage = error.toString();
      ERROR('ACCOUNT-LINK', `Swallowing error: ${errorMessage}`);
    });
  }
}
