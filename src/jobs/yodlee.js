/* @flow */

import * as FirebaseAdmin from 'firebase-admin';

import invariant from 'invariant';

import {
  createSemaphore,
  wrapInSemaphoreRequest,
} from '../SingleThreadSemaphore';
import { genUpsertAccountFromYodleeAccount } from 'common/lib/models/Account';

import {
  genFetchRefreshInfoForUser,
  getYodleeRefreshInfoCollection,
  isComplete,
  updateRefreshInfo,
} from 'common/lib/models/YodleeRefreshInfo';

import type YodleeClient from '../YodleeClient';

import type { ID } from 'common/types/core';
import type { ProviderAccount } from 'common/types/yodlee';
import type { YodleeRefreshInfo } from 'common/lib/models/YodleeRefreshInfo';

// Only 1 yodlee operation allowed at a time.
const yodleeSemaphore = createSemaphore(1);

/**
 * Update the refresh info of all accounts for a particular user. Once the
 * update happens, if any refresh status are marked as successful, then refresh
 * the accounts for that data.
 */
export async function genUpdateAccounts(
  yodleeUserSession: string,
  client: YodleeClient,
  userID: ID,
): Promise<void> {
  const refreshes = await genFetchRefreshInfoForUser(userID);
  const providerAccounts = await genFetchProviderAccounts(
    yodleeUserSession,
    client,
    refreshes,
  );

  const refreshInfoBatch = FirebaseAdmin.firestore().batch();
  // Mapping from provider account id to array of accounts.
  let genUpdateAndSyncAllProviderAccounts = Promise.resolve();

  providerAccounts.forEach((providerAccount, index) => {
    const refreshInfo = refreshes[index];
    const newRawRefreshInfo = providerAccount.refreshInfo;
    const newRefreshInfo = updateRefreshInfo(refreshInfo, newRawRefreshInfo);
    if (isComplete(newRefreshInfo)) {
      const { providerAccountID } = newRefreshInfo;
      genUpdateAndSyncAllProviderAccounts = genUpdateAndSyncAllProviderAccounts.then(
        () =>
          genUpdateAndSyncProviderAccount(
            yodleeUserSession,
            client,
            userID,
            providerAccountID,
          ),
      );
      // Fetch the new accounts and add them to the batch.
    }

    const ref = getYodleeRefreshInfoCollection().doc(newRefreshInfo.id);
    refreshInfoBatch.update(ref, newRefreshInfo);
  });

  await Promise.all([
    refreshInfoBatch.commit(),
    genUpdateAndSyncAllProviderAccounts,
  ]);
}

export async function genForceUpdateAccounts(
  yodleeUserSession: string,
  client: YodleeClient,
  userID: ID,
): Promise<void> {
  const yodleeAccounts = await client.genAccounts(yodleeUserSession);
  const updates = yodleeAccounts.map(yodleeAccount =>
    genUpsertAccountFromYodleeAccount(yodleeAccount, userID),
  );

  await Promise.all(updates);
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

async function genUpdateAndSyncProviderAccount(
  yodleeUserSession: string,
  client: YodleeClient,
  userID: ID,
  providerAccountID: ID,
): Promise<void> {
  // Step 1: Fetch the yodlee accounts.
  const yodleeAccounts = await wrapInSemaphoreRequest(yodleeSemaphore, () =>
    client.genAccountsForProviderAccount(yodleeUserSession, providerAccountID),
  );

  // Step 2: Update the accounts that were fetched.
  const updateAccounts = yodleeAccounts.map(yodleeAccount =>
    genUpsertAccountFromYodleeAccount(yodleeAccount, userID),
  );
  await Promise.all(updateAccounts);
}

function genFetchProviderAccounts(
  yodleeUserSession: string,
  client: YodleeClient,
  refreshes: Array<YodleeRefreshInfo>,
): Promise<Array<ProviderAccount>> {
  const promises: Array<Promise<ProviderAccount>> = refreshes.map(
    refreshInfo => {
      const { providerAccountID } = refreshInfo;
      return wrapInSemaphoreRequest(yodleeSemaphore, () =>
        client.genProviderAccount(yodleeUserSession, providerAccountID),
      ).then(providerAccount => {
        invariant(
          providerAccount,
          'No provider account found for id %s',
          refreshInfo.id,
        );
        return providerAccount;
      });
    },
  );
  return Promise.all(promises);
}
