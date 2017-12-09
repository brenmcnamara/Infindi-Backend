/* @flow */

import type { ID, ZeroToOneInclusive } from 'common/src/types/core';

async function genSavingsRate(userID: ID): Promise<ZeroToOneInclusive> {
  return Promise.resolve(0);
}

export default genSavingsRate;
