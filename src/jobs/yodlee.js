/* @flow */

import * as FirebaseAdmin from 'firebase-admin';

import invariant from 'invariant';

import {
  createSemaphore,
  requestSemaphore,
  releaseSemaphore,
} from '../SingleThreadSemaphore';
import {
  genFetchRefreshInfoForUser,
  updateRefreshInfo,
} from 'common/lib/models/YodleeRefreshInfo';

import type YodleeClient from '../YodleeClient';

import type { ID } from 'common/types/core';
import type { ProviderAccount } from 'common/types/yodlee';
import type { YodleeRefreshInfo } from 'common/lib/models/YodleeRefreshInfo';

/**
 * Update the refresh info of all accounts for a particular user. Once the
 * update happens, if any refresh status are marked as successful, then refresh
 * the accounts for that data.
 */
export async function genUpdateAccounts(
  yodleeClient: YodleeClient,
  userID: ID,
): Promise<void> {
  const refreshes = await genFetchRefreshInfoForUser(userID);
  const providerAccounts = await genFetchProviderAccounts(
    yodleeClient,
    refreshes,
  );

  const batch = FirebaseAdmin.firestore().batch();

  providerAccounts.forEach((providerAccount, index) => {
    const refreshInfo = refreshes[index];
    const newRawRefreshInfo = providerAccount.refreshInfo;
    if (newRawRefreshInfo.status === 'SUCCESS') {
      // Fetch the new accounts and add them to the batch.
    }
    const newRefreshInfo = updateRefreshInfo(refreshInfo, newRawRefreshInfo);
    const ref = FirebaseAdmin.firestore()
      .collection('YodleeRefreshInfo')
      .doc(newRefreshInfo.id);
    batch.update(ref, newRefreshInfo);
  });

  await batch.commit();
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function genFetchProviderAccounts(
  client: YodleeClient,
  refreshes: Array<YodleeRefreshInfo>,
): Promise<Array<ProviderAccount>> {
  const semaphore = createSemaphore(1);
  const promises: Array<Promise<ProviderAccount>> = refreshes.map(
    refreshInfo => {
      let request: ID;
      let providerAccount: ProviderAccount;
      return requestSemaphore(semaphore)
        .then(_request => (request = _request))
        .then(() => client.genProviderAccount(refreshInfo.providerAccountID))
        .then(_providerAccount => {
          invariant(
            _providerAccount,
            'No provider account found for id %s',
            refreshInfo.id,
          );
          providerAccount = _providerAccount;
        })
        .then(() => releaseSemaphore(semaphore, request))
        .then(() => providerAccount);
    },
  );
  return Promise.all(promises);
}
