/* @flow */

import type { AccountLink } from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';

export type EventEmitter = { remove: () => void };
export type LinkEventCallback = (event: LinkEvent) => void;

let linkEventCallback: LinkEventCallback | null = null;

function genRefreshAccountLink(accountLinkID: ID): Promise<void> {
  return Promise.reject(Error('Implement me!'));
}

/**
 * Refetches the account link from the source of truth.
 */
function genRefetchAccountLink(accountLinkID: ID): Promise<void> {
  return Promise.reject(Error('Implement me!'));
}

function genSetAccountLink(accountLink: AccountLink): Promise<void> {
  return Promise.reject(Error('Implement me!'));
}

function onLinkEvent(cb: LinkEventCallback): EventEmitter {
  linkEventCallback = cb;
  return {
    remove: () => {
      linkEventCallback = null;
    },
  };
}

const LinkEngine = {
  genRefetchAccountLink: decoratorAsyncErrorHandling(genRefetchAccountLink),
  genRefreshAccountLink: decoratorAsyncErrorHandling(genRefreshAccountLink),
  genSetAccountLink: decoratorAsyncErrorHandling(genSetAccountLink),
  onLinkEvent,
};

export type LinkEngineType = typeof LinkEngine;
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
      linkEventCallback && linkEventCallback(linkEvent);
    }
  };
}
