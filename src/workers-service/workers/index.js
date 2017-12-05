/* @flow */

import { initialize as initializePlaid } from './plaid';

export function initialize(): void {
  initializePlaid();
}
