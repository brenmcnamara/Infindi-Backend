/* @flow */

import invariant from 'invariant';

import { ERROR } from '../../../log-utils';
import {
  genFetchAccountLink,
  genUpdateAccountLink,
  updateAccountLinkStatus,
} from 'common/lib/models/AccountLink';
import {
  genProviderAccount,
  genProviderAccountRefresh,
} from '../../../yodlee/yodlee-manager';

import type {
  AccountLink,
  AccountLinkStatus,
} from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';
import type { ProviderAccount as YodleeProviderAccount } from 'common/types/yodlee-v1.0';

export type EventEmitter = { remove: () => void };
export type LinkEventCallback = (event: LinkEvent) => void;

export default class LinkEngine {
  _accountLinkID: ID;
  _linkEventCallback: LinkEventCallback | null = null;

  constructor(accountLinkID: ID) {
    this._accountLinkID = accountLinkID;
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
      // TODO: Should not be calling private method from outside scope.
      this._sendEvent(linkEvent);
    });
  }

  _errorSwallowerAsync(cb: () => Promise<void>): Promise<void> {
    return cb().catch(error => {
      // TODO: Propert error message extraction.
      const errorMessage = error.toString();
      ERROR('ACCOUNT-LINK', `Swallowing error: ${errorMessage}`);
    });
  }

  /**
   * Signals the source of truth that it is time to start updating the account
   * link.
   */
  async genRefreshAccountLink(): Promise<void> {
    await this._errorHandlerAsync(async () => {
      const accountLink = await genForceFetchAccountLink(this._accountLinkID);
      const userID = accountLink.userRef.refID;
      const providerAccount = getYodleeProviderAccount(accountLink);
      const providerAccountID = String(providerAccount.id);
      await genProviderAccountRefresh(userID, providerAccountID);
    });
  }

  /**
   * Refetches the account link from the source of truth.
   */
  async genRefetchAccountLink(): Promise<void> {
    await this._errorHandlerAsync(async () => {
      const accountLink = genFetchAccountLink(this._accountLinkID);
      const providerAccount = genProviderAccount();
    });
  }

  async genSetAccountLink(accountLink: AccountLink): Promise<void> {
    await this._errorHandlerAsync(async () => {
      await genUpdateAccountLink(accountLink);
    });
  }

  async genSetAccountLinkStatus(status: AccountLinkStatus): Promise<void> {
    await this._errorHandlerAsync(async () => {
      const accountLink = await genForceFetchAccountLink(this._accountLinkID);
      await genUpdateAccountLink(updateAccountLinkStatus(accountLink, status));
    });
  }

  async genLogStartLinking(): Promise<void> {
    await this._errorSwallowerAsync(() => {
      return Promise.reject(Error('genLogStartLinking: Implement me!'));
    });
  }

  async genLogEndLinking(): Promise<void> {
    await this._errorSwallowerAsync(() => {
      return Promise.reject(Error('genLogEndLinking: Implement me!'));
    });
  }

  successfullyTerminateLink() {
    this._sendEvent({ type: 'LINK_COMPLETE' });
  }

  onLinkEvent(cb: LinkEventCallback): EventEmitter {
    this._linkEventCallback = cb;
    return {
      remove: () => {
        this._linkEventCallback = null;
      },
    };
  }

  _sendEvent(linkEvent: LinkEvent): void {
    this._linkEventCallback && this._linkEventCallback(linkEvent);
  }
}

async function genForceFetchAccountLink(
  accountLinkID: ID,
): Promise<AccountLink> {
  const accountLink = await genFetchAccountLink(accountLinkID);
  if (!accountLink) {
    const errorCode = 'infindi/resource-not-found';
    const errorMessage = `Could not find account link: ${accountLinkID}`;
    const toString = `[${errorCode}]: ${errorMessage}`;
    throw { errorCode, errorMessage, toString };
  }
  return accountLink;
}

function getYodleeProviderAccount(
  accountLink: AccountLink,
): YodleeProviderAccount {
  const { sourceOfTruth } = accountLink;
  invariant(
    sourceOfTruth.type === 'YODLEE',
    'Expecting source of truth to come from YODLEE',
  );
  return sourceOfTruth.providerAccount;
}
