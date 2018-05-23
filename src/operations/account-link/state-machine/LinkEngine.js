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

class LinkEngine {
  _linkEventCallback: LinkEventCallback | null = null;

  /**
   * Signals the source of truth that it is time to start updating the account
   * link.
   */
  genRefreshAccountLink(accountLinkID: ID): Promise<void> {
    return Promise.reject(Error('Implement me!'));
  }

  /**
   * Refetches the account link from the source of truth.
   */
  genRefetchAccountLink(accountLinkID: ID): Promise<void> {
    return Promise.reject(Error('Implement me!'));
  }

  async genSetAccountLink(accountLink: AccountLink): Promise<void> {
    await genUpdateAccountLink(accountLink);
  }

  async genSetAccountLinkStatus(
    accountLinkID: ID,
    status: AccountLinkStatus,
  ): Promise<void> {
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
  }

  successfullyTerminateLink(accountLinkID: ID): void {
    this._sendEvent({ type: 'LINK_COMPLETE' });
  }

  genLogStartLinking(accountLinkID: ID): Promise<void> {
    return Promise.reject(Error('Implement me!'));
  }

  genLogEndLinking(accountLinkID: ID): Promise<void> {
    return Promise.reject(Error('Implement me!'));
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

export default LinkEngine;

function decoratorAsyncErrorHandling(
  gen: (...args: *) => Promise<void>,
): (...args: *) => Promise<void> {
  return async () => {
    try {
      await gen.apply(gen, arguments);
    } catch (error) {
      // TODO: Proper error detection here. Where is the error coming from?
      // Is there anything from the error that we can parse out to discover
      // what kind of error it is?
      const linkEvent = {
        errorType: 'INTERNAL',
        errorMessage: error.toString(),
        type: 'ERROR',
      };
      // TODO: This does not have the right context.
      this._sendEvent(linkEvent);
    }
  };
}

function decoratorSwallowError(
  gen: (...args: *) => Promise<void>,
): (...args: *) => Promise<void> {
  return async () => {
    try {
      await gen.apply(gen, arguments);
    } catch (error) {
      // TODO: Propert error message extraction.
      const errorMessage = error.toString();
      ERROR('ACCOUNT-LINK', `Swallowing error: ${errorMessage}`);
    }
  };
}
