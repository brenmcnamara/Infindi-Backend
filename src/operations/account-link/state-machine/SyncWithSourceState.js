/* @flow */

import LinkState from './LinkState';

/**
 * Enter this state when we are ready to sync the source of truth of the
 * link to the internal datastores (i.e. Download yodlee data into firebase).
 */
export default class SyncWithSourceState extends LinkState {}
