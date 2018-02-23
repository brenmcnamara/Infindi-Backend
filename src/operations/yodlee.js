/* @flow */

import * as FirebaseAdmin from 'firebase-admin';

import invariant from 'invariant';
import nullthrows from 'nullthrows';

import {
  createSemaphore,
  wrapInSemaphoreRequest,
} from '../SingleThreadSemaphore';
import { ERROR, INFO } from '../log-utils';
import { genUpsertAccountFromYodleeAccount } from 'common/lib/models/Account';

import {
  createRefreshInfo,
  genCreateRefreshInfo as genCreateRefreshInfoModel,
  genDeleteRefreshInfo as genDeleteRefreshInfoModel,
  genFetchRefreshInfoForUser,
  getRefreshInfoCollection,
  genUpdateRefreshInfo as genUpdateRefreshInfoModel,
  isComplete,
  updateRefreshInfo,
} from 'common/lib/models/RefreshInfo';

import type YodleeClient from '../YodleeClient';

import type { ID } from 'common/types/core';
import type { ProviderAccount } from 'common/types/yodlee';
import type { RefreshInfo } from 'common/lib/models/RefreshInfo';

// Only 1 yodlee operation allowed at a time.
const yodleeSemaphore = createSemaphore(1);

/**
 * Update the refresh info for a user and fetch any refresh info that is missing
 * for the user.
 */
export async function genUpdateRefreshInfo(
  yodleeUserSession: string,
  client: YodleeClient,
  userID: ID,
): Promise<void> {
  INFO('YODLEE', 'Updating refresh info');
  const refreshes = await genFetchRefreshInfoForUser(userID);
  const providerAccounts = await client.genProviderAccounts(yodleeUserSession);

  const existingProviderAccounts = providerAccounts.filter(pAccount =>
    refreshes.some(info => {
      const { sourceOfTruth } = info;
      return (
        sourceOfTruth.type === 'YODLEE' &&
        sourceOfTruth.providerAccountID === String(pAccount.id)
      );
    }),
  );
  const newProviderAccounts = providerAccounts.filter(
    pAccount => !existingProviderAccounts.includes(pAccount),
  );

  INFO(
    'YODLEE',
    `Updating ${existingProviderAccounts.length} refresh(es) and creating ${
      newProviderAccounts.length
    } refresh(es)`,
  );

  const promises = [];

  for (const pAccount of existingProviderAccounts) {
    let refreshInfo = nullthrows(
      refreshes.find(info => {
        const { sourceOfTruth } = info;
        return (
          sourceOfTruth.type === 'YODLEE' &&
          sourceOfTruth.providerAccountID === String(pAccount.id)
        );
      }),
    );
    const sourceOfTruth = {
      providerAccountID: String(pAccount.id),
      type: 'YODLEE',
      value: pAccount.refreshInfo,
    };
    refreshInfo = updateRefreshInfo(refreshInfo, sourceOfTruth);
    promises.push(genUpdateRefreshInfoModel(refreshInfo));
  }

  for (const pAccount of newProviderAccounts) {
    const sourceOfTruth = {
      providerAccountID: String(pAccount.id),
      type: 'YODLEE',
      value: pAccount.refreshInfo,
    };
    const refreshInfo = createRefreshInfo(
      sourceOfTruth,
      userID,
      String(pAccount.providerId),
    );
    promises.push(genCreateRefreshInfoModel(refreshInfo));
  }

  try {
    await Promise.all(promises);
  } catch (error) {
    ERROR('YODLEE', 'Failed to update refresh info');
    throw error;
  }
  INFO('YODLEE', 'Update is complete');
}

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
    const newYodleeRefreshInfo = providerAccount.refreshInfo;
    const sourceOfTruth = {
      providerAccountID: String(providerAccount.id),
      type: 'YODLEE',
      value: newYodleeRefreshInfo,
    };
    const newRefreshInfo = updateRefreshInfo(refreshInfo, sourceOfTruth);
    if (isComplete(newRefreshInfo)) {
      const { sourceOfTruth } = newRefreshInfo;
      invariant(
        sourceOfTruth.type === 'YODLEE',
        'Expecting refresh info to come from YODLEE',
      );
      const { providerAccountID } = sourceOfTruth;
      INFO(
        'YODLEE',
        `Updating provider accounts for refresh ${newRefreshInfo.id}`,
      );
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

    const ref = getRefreshInfoCollection().doc(newRefreshInfo.id);
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

export async function genCleanupRefreshInfo(userID: ID): Promise<void> {
  // If the user has multiple login attempts with the same provider, we can
  // end up having multiple refresh infos open for the same provider account.
  // Will delete extra refresh info models if found.
  INFO('YODLEE', 'Cleaning up refresh info');
  const refreshes = await genFetchRefreshInfoForUser(userID);

  const extraRefreshes = refreshes.filter(info => {
    const { sourceOfTruth } = info;
    if (sourceOfTruth.type !== 'YODLEE') {
      return false;
    }
    const providerID = info.providerRef.refID;
    const lastRefreshAttemptMillis = Date.parse(
      sourceOfTruth.value.lastRefreshAttempt,
    );
    const isMostRecentRefresh = refreshes.every(info2 => {
      if (info === info2) {
        return true;
      } else if (info2.sourceOfTruth.type !== 'YODLEE') {
        return true;
      } else if (info2.providerRef.refID !== providerID) {
        return true;
      }
      const lastRefreshAttempMillis2 = Date.parse(
        info2.sourceOfTruth.value.lastRefreshAttempt,
      );
      // NOTE: Making a possibly naive assumption that the last refresh attempts
      // of different refresh infos are never the same. If they are the same,
      // we will end up with the case where we can have no refresh that is most
      // recent, and accidentally delete a refresh we do not want to delete.
      return lastRefreshAttemptMillis > lastRefreshAttempMillis2;
    });
    return !isMostRecentRefresh;
  });

  INFO('YODLEE', `Deleting ${extraRefreshes.length} refresh info docs`);

  try {
    await Promise.all(
      extraRefreshes.map(info => genDeleteRefreshInfoModel(info.id)),
    );
  } catch (error) {
    ERROR('YODLEE', 'Failed to cleanup extra refreshes');
    throw error;
  }
  INFO('YODLEE', 'Finished cleaning up extra refreshes');
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
  refreshes: Array<RefreshInfo>,
): Promise<Array<ProviderAccount>> {
  const promises: Array<Promise<ProviderAccount>> = refreshes.map(
    refreshInfo => {
      const { sourceOfTruth } = refreshInfo;
      invariant(
        sourceOfTruth.type === 'YODLEE',
        'Expecting refresh info to come from YODLEE',
      );
      const { providerAccountID } = sourceOfTruth;
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
