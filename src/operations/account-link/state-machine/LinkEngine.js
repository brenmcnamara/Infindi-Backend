/* @flow */

import { ERROR } from '../../../log-utils';
import {
  genFetchAccountLink,
  genUpdateAccountLink,
  updateAccountLinkStatus,
} from 'common/lib/models/AccountLink';

import type {
  AccountLink,
  AccountLinkStatus,
} from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';

export type EventEmitter = { remove: () => void };
export type LinkEventCallback = (event: LinkEvent) => void;

export default class LinkEngine {
  _linkEventCallback: LinkEventCallback | null = null;

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
  async genRefreshAccountLink(accountLinkID: ID): Promise<void> {
    await this._errorHandlerAsync(() => {
      return Promise.reject(Error('genRefreshAccountLink: Implement me!'));
    });
  }

  /**
   * Refetches the account link from the source of truth.
   */
  async genRefetchAccountLink(accountLinkID: ID): Promise<void> {
    await this._errorHandlerAsync(() => {
      return Promise.reject(Error('genRefetchAccountLink: Implement me!'));
    });
  }

  async genSetAccountLink(accountLink: AccountLink): Promise<void> {
    await this._errorHandlerAsync(async () => {
      await genUpdateAccountLink(accountLink);
    });
  }

  async genSetAccountLinkStatus(
    accountLinkID: ID,
    status: AccountLinkStatus,
  ): Promise<void> {
    await this._errorHandlerAsync(async () => {
      const accountLink = await genFetchAccountLink(accountLinkID);
      if (!accountLink) {
        this._sendEvent({
          errorMessage: `Cannot find account link with id: ${accountLinkID}`,
          errorType: 'INTERNAL',
          type: 'ERROR',
        });
        return;
      }
      await genUpdateAccountLink(updateAccountLinkStatus(accountLink, status));
    });
  }

  async genLogStartLinking(accountLinkID: ID): Promise<void> {
    await this._errorSwallowerAsync(() => {
      return Promise.reject(Error('genLogStartLinking: Implement me!'));
    });
  }

  async genLogEndLinking(accountLinkID: ID): Promise<void> {
    await this._errorSwallowerAsync(() => {
      return Promise.reject(Error('genLogEndLinking: Implement me!'));
    });
  }

  successfullyTerminateLink(accountLinkID: ID) {
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
