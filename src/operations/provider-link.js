/* @flow */

import * as FirebaseAdmin from 'firebase-admin';

import invariant from 'invariant';
import nullthrows from 'nullthrows';

import {
  createAccountFromYodleeAccount,
  genFetchAccountsForRefreshInfo,
  getAccountsCollection,
  updateAccountFromYodleeAccount,
} from 'common/lib/models/Account';
import {
  createRefreshInfo,
  didFail,
  genCreateRefreshInfo,
  genFetchRefreshInfo,
  genFetchRefreshInfoForProvider,
  isComplete,
  isInProgress,
  isPendingStatus,
  updateRefreshInfo,
} from 'common/lib/models/RefreshInfo';
import {
  createSemaphore,
  wrapInSemaphoreRequest,
} from '../SingleThreadSemaphore';
import { genCheckAndRefreshYodleeUserSession } from '../yodlee-manager';
import { INFO } from '../log-utils';

import type YodleeClient from '../YodleeClient';

import type { Account } from 'common/lib/models/Account';
import type { ID } from 'common/types/core';
import type {
  ProviderAccount as YodleeProviderAccount,
  ProviderFull as YodleeProvider,
} from 'common/types/yodlee';
import type { RefreshInfo } from 'common/lib/models/RefreshInfo';

// Only 1 yodlee operation allowed at a time.
const yodleeSemaphore = createSemaphore(1);

export async function genYodleeProviderLogin(
  yodleeUserSession: string,
  yodleeClient: YodleeClient,
  yodleeProvider: YodleeProvider,
  userID: ID,
): Promise<RefreshInfo> {
  INFO('PROVIDER-LINK', 'Linking yodlee account');

  const loginPayload = await yodleeClient.genProviderLogin(
    yodleeUserSession,
    yodleeProvider,
  );
  const yodleeRefreshInfo = loginPayload.refreshInfo;
  const providerID = String(yodleeProvider.id);
  const providerAccountID = String(loginPayload.providerAccountId);
  const refreshInfoSourceOfTruth = {
    providerAccountID,
    type: 'YODLEE',
    value: yodleeRefreshInfo,
  };

  INFO('PROVIDER-LINK', 'Checking if refresh info for account already exists');
  const currentRefreshInfo = await genFetchAndValidateRefreshInfoForProvider(
    userID,
    providerID,
  );
  const refreshInfo: RefreshInfo = currentRefreshInfo
    ? updateRefreshInfo(currentRefreshInfo, refreshInfoSourceOfTruth)
    : createRefreshInfo(refreshInfoSourceOfTruth, userID, providerID);

  INFO('PROVIDER-LINK', 'Creating / Updating refresh info');
  await genCreateRefreshInfo(refreshInfo);
  return refreshInfo;
}

export async function genYodleeProviderLink(
  yodleeUserSession: string,
  client: YodleeClient,
  refreshInfoID: ID,
): Promise<void> {
  let refreshInfo = await genFetchRefreshInfo(refreshInfoID);
  invariant(
    refreshInfo,
    'Expecting refresh info to exist after linking is complete',
  );

  const userID = refreshInfo.userRef.refID;
  INFO(
    'PROVIDER-LINK',
    'Checking yodlee provider for completed linking attempt',
  );
  let isDoneProcessing = await genYodleeCheckProviderLink(
    yodleeUserSession,
    client,
    refreshInfoID,
  );
  let sleepTime = 5000;
  while (!isDoneProcessing) {
    INFO(
      'PROVIDER-LINK',
      'Yodlee Provider linking is not complete, timing out then trying again',
    );
    await sleepForMillis(sleepTime);
    yodleeUserSession = await genCheckAndRefreshYodleeUserSession(userID);
    INFO(
      'PROVIDER-LINK',
      'Checking yodlee provider for completed linking attempt',
    );
    isDoneProcessing = await genYodleeCheckProviderLink(
      yodleeUserSession,
      client,
      refreshInfoID,
    );
    sleepTime = Math.min(10000, sleepTime + 1000);
  }

  INFO('PROVIDER-LINK', 'Yodlee has completed linking attempt');
  refreshInfo = await genFetchRefreshInfo(refreshInfoID);
  invariant(
    refreshInfo,
    'Expecting refresh info to exist after linking is complete',
  );

  if (didFail(refreshInfo)) {
    INFO(
      'PROVIDER-LINK',
      `Yodlee linking failed. Check refresh for more info: ${refreshInfo.id}`,
    );
    return;
  }

  invariant(
    isComplete(refreshInfo),
    'Refresh info is in unknown state. Please check refresh for more info: %s',
    refreshInfo.id,
  );

  // Perform the linking + update here.
  await genUpdateAndSyncProviderAccount(
    yodleeUserSession,
    client,
    userID,
    refreshInfo,
  );
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
  refreshInfo: RefreshInfo,
): Promise<void> {
  const providerAccountID = getYodleeProviderAccountID(refreshInfo);
  // Fetch the yodlee accounts.
  const yodleeAccounts = await wrapInSemaphoreRequest(yodleeSemaphore, () =>
    client.genAccountsForProviderAccount(yodleeUserSession, providerAccountID),
  );

  // Update existing accounts, create new accounts, delete old accounts.
  const yodleeAccountStatusMap = {};
  const prevAccounts = await genFetchAccountsForRefreshInfo(refreshInfo.id);

  // Figure out which accounts need to be updated or deleted.
  for (const prevAccount of prevAccounts) {
    const stillExists = yodleeAccounts.some(yAccount =>
      doesAccountMatchYodleeAccountID(prevAccount, String(yAccount.id)),
    );
    const prevYodleeAccountID = getYodleeAccountID(prevAccount);
    yodleeAccountStatusMap[prevYodleeAccountID] = stillExists
      ? 'UPDATE'
      : 'DELETE';
  }

  // Any accounts that are not marked as updated or deleted should be created.
  for (const yodleeAccount of yodleeAccounts) {
    const yodleeAccountID = String(yodleeAccount.id);
    if (!yodleeAccountStatusMap[yodleeAccountID]) {
      yodleeAccountStatusMap[yodleeAccountID] = 'CREATE';
    }
  }

  const batch = FirebaseAdmin.firestore().batch();

  for (const yodleeAccountID in yodleeAccountStatusMap) {
    if (!yodleeAccountStatusMap.hasOwnProperty(yodleeAccountID)) {
      continue;
    }
    const status = yodleeAccountStatusMap[yodleeAccountID];
    switch (status) {
      case 'UPDATE': {
        const account = nullthrows(
          prevAccounts.find(a =>
            doesAccountMatchYodleeAccountID(a, yodleeAccountID),
          ),
        );
        const yodleeAccount = nullthrows(
          yodleeAccounts.find(ya => String(ya.id) === yodleeAccountID),
        );
        const ref = getAccountsCollection().doc(account.id);
        const newAccount = updateAccountFromYodleeAccount(
          account,
          yodleeAccount,
        );
        batch.update(ref, newAccount);
        break;
      }

      case 'DELETE': {
        const account = nullthrows(
          prevAccounts.find(a =>
            doesAccountMatchYodleeAccountID(a, yodleeAccountID),
          ),
        );
        const ref = getAccountsCollection().doc(account.id);
        batch.delete(ref);
        break;
      }

      case 'CREATE': {
        const yodleeAccount = nullthrows(
          yodleeAccounts.find(ya => String(ya.id) === yodleeAccountID),
        );
        const newAccount = createAccountFromYodleeAccount(
          yodleeAccount,
          userID,
        );
        const ref = getAccountsCollection().doc(newAccount.id);
        batch.set(ref, newAccount);
        break;
      }

      default:
        invariant(false, 'Unexpected account status: %s', status);
    }
  }

  await batch.commit();
}

async function genYodleeCheckProviderLink(
  yodleeUserSession: string,
  client: YodleeClient,
  refreshInfoID: ID,
): Promise<bool> {
  INFO('PROVIDER-LINK', 'Attempting provider link');

  const refreshInfo = await genFetchRefreshInfo(refreshInfoID);
  invariant(
    refreshInfo,
    'No refresh info found while attempting provider link',
  );

  const yodleeProviderAccount = await genYodleeProviderAccount(
    yodleeUserSession,
    client,
    refreshInfo,
  );

  const { sourceOfTruth } = refreshInfo;
  invariant(
    sourceOfTruth.type === 'YODLEE',
    'Expecting refresh info to come from Yodlee',
  );
  const yodleeRefreshInfo = yodleeProviderAccount.refreshInfo;
  const newSourceOfTruth = {
    providerAccountID: refreshInfo.sourceOfTruth.providerAccountID,
    type: 'YODLEE',
    value: yodleeRefreshInfo,
  };

  INFO('PROVIDER-LINK', 'Updating refresh info');
  const newRefreshInfo = updateRefreshInfo(refreshInfo, newSourceOfTruth);
  await genCreateRefreshInfo(newRefreshInfo);
  return !isInProgress(newRefreshInfo) && !isPendingStatus(newRefreshInfo);
}

async function genYodleeProviderAccount(
  yodleeUserSession: string,
  client: YodleeClient,
  refreshInfo: RefreshInfo,
): Promise<YodleeProviderAccount> {
  const providerAccountID = getYodleeProviderAccountID(refreshInfo);
  const yodleeProviderAccount = await client.genProviderAccount(
    yodleeUserSession,
    providerAccountID,
  );
  invariant(
    yodleeProviderAccount,
    'No provider account found for refresh info: %s',
    refreshInfo.id,
  );
  return yodleeProviderAccount;
}

async function genFetchAndValidateRefreshInfoForProvider(
  userID: ID,
  providerID: ID,
) {
  const refreshInfo = await genFetchRefreshInfoForProvider(userID, providerID);
  if (
    refreshInfo &&
    (isPendingStatus(refreshInfo) && isInProgress(refreshInfo))
  ) {
    throw {
      errorCode: 'infindi/bad-request',
      errorMessage: 'Provider is already being logged in',
    };
  }
  return refreshInfo;
}

function sleepForMillis(millis: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
}

function getYodleeProviderAccountID(refreshInfo: RefreshInfo): ID {
  const { sourceOfTruth } = refreshInfo;
  invariant(
    sourceOfTruth.type === 'YODLEE',
    'Expecting refresh info to come from Yodlee',
  );
  return sourceOfTruth.providerAccountID;
}

function doesAccountMatchYodleeAccountID(
  account: Account,
  yodleeAccountID: ID,
): bool {
  const { sourceOfTruth } = account;
  if (sourceOfTruth.type !== 'YODLEE') {
    return false;
  }
  return String(sourceOfTruth.value.id) === yodleeAccountID;
}

function getYodleeAccountID(account: Account): string {
  const { sourceOfTruth } = account;
  invariant(
    sourceOfTruth.type === 'YODLEE',
    'Expecting account to come from Yodlee',
  );
  return String(sourceOfTruth.value.id);
}
