/* @flow */

import type { LinkEvent } from './LinkEvent';

export type EventEmitter = { remove: () => void };
export type LinkEventCallback = (event: LinkEvent) => void;

let linkEventCallback: LinkEventCallback | null = null;

/**
 * Performs all the side effects required for linking to work.
 */
const LinkEngine = {
  onLinkEvent(cb: LinkEventCallback): EventEmitter {
    linkEventCallback = cb;
    return {
      remove: () => {
        linkEventCallback = null;
      },
    };
  },
};

export type LinkEngineType = typeof LinkEngine;
export default LinkEngine;
