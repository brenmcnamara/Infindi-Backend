/* @flow */

import invariant from 'invariant';

import {
  createAccountLinkYodlee,
  genCreateAccountLink,
  genFetchAccountLink,
  genFetchAccountLinkForProvider,
  isInMFA,
  isLinking,
  isLinkFailure,
  isLinkSuccess,
  updateAccountLinkStatus,
  updateAccountLinkYodlee,
} from 'common/lib/models/AccountLink';
import { genProviderAccount, genProviderLogin } from '../../yodlee-manager';
import { genUpdateLink, genYodleeLinkPass, handleLinkingError } from './utils';
import { INFO } from '../../log-utils';

import type {
  AccountLink,
  AccountLinkStatus,
} from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';
import type {
  ProviderAccount as YodleeProviderAccount,
  ProviderFull as YodleeProvider,
} from 'common/types/yodlee';

export async function genYodleeProviderLogin(
  userID: ID,
  yodleeProvider: YodleeProvider,
): Promise<AccountLink> {
  INFO('ACCOUNT-LINK', 'Linking yodlee account');

  const loginPayload = await genProviderLogin(userID, yodleeProvider);
  const providerID = String(yodleeProvider.id);
  const providerAccountID = String(loginPayload.providerAccountId);
  const yodleeProviderAccount = await genProviderAccount(
    userID,
    providerAccountID,
  );
  invariant(
    yodleeProviderAccount,
    'Expecting yodlee provider account to exist after login attempt',
  );

  INFO(
    'ACCOUNT-LINK',
    `Checking if account link for provider ${providerID} already exists`,
  );
  const existingAccountLink = await genFetchAccountLinkForProvider(
    userID,
    providerID,
  );
  if (existingAccountLink && isLinking(existingAccountLink)) {
    // TODO: This should not have to know about requests.
    throw {
      errorCode: 'infindi/bad-request',
      errorMessage: 'Cannot link accounts that are already being linked',
    };
  }

  INFO(
    'ACCOUNT-LINK',
    existingAccountLink
      ? `Found existing account link for provider ${providerID}`
      : `No account link found for provider ${providerID}`,
  );
  const accountLink: AccountLink = existingAccountLink
    ? updateAccountLinkYodlee(existingAccountLink, yodleeProviderAccount)
    : createAccountLinkYodlee(yodleeProviderAccount, userID, providerID);

  INFO('ACCOUNT-LINK', 'Creating / Updating refresh info');
  await genCreateAccountLink(accountLink);
  return accountLink;
}

export async function genYodleePerformLink(accountLinkID: ID): Promise<void> {
  await handleLinkingError(accountLinkID, () =>
    genYodleePerformLinkImpl(accountLinkID),
  );
}

async function genYodleePerformLinkImpl(accountLinkID: ID): Promise<void> {
  INFO('ACCOUNT-LINK', `Performing link with account link ${accountLinkID}`);
  let accountLink = await genFetchAccountLink(accountLinkID);
  if (!accountLink) {
    // TODO: Move these types of errors to the request logic. This should be
    // agnostic to the caller.
    throw {
      errorCode: 'infindi/server-error',
      errorMessage: 'Trying to wait for non-existent account link',
    };
  }

  const userID = accountLink.userRef.refID;
  INFO(
    'ACCOUNT-LINK',
    'Checking yodlee provider for completed linking attempt',
  );
  let newAccountLink = await genYodleeLinkPass(userID, accountLinkID);
  const sleepTime = 3000;
  while (isLinking(newAccountLink) || isInMFA(newAccountLink)) {
    await sleepForMillis(sleepTime);
    newAccountLink = await genYodleeLinkPass(userID, accountLinkID);
  }

  INFO('ACCOUNT-LINK', 'Yodlee has completed linking attempt');
  invariant(
    accountLink && !isLinking(accountLink),
    'Expecting account link to exist after linking is complete',
  );

  if (isLinkFailure(accountLink)) {
    INFO(
      'ACCOUNT-LINK',
      `Yodlee linking failed. Check account link for more info: ${
        accountLink.id
      }`,
    );
    return;
  }

  invariant(
    isLinkSuccess(accountLink),
    'Refresh info is in unknown state. Please check refresh for more info: %s',
    accountLink.id,
  );

  // Perform the linking + update here.
  await genUpdateLink(accountLink);
  INFO('ACCOUNT-LINK', 'Finished downloading account link data');
}

export async function genTestYodleeProviderLogin(
  userID: ID,
  yodleeProvider: YodleeProvider,
): Promise<AccountLink> {
  await sleepForMillis(3000);

  // STEP 1: IN_PROGRESS / VERIFYING_CREDENTIALS

  let accountLink = await genFetchAccountLinkForProvider(
    userID,
    String(yodleeProvider.id),
  );

  accountLink = accountLink
    ? updateAccountLinkStatus(
        accountLink,
        'IN_PROGRESS / VERIFYING_CREDENTIALS',
      )
    : createAccountLinkYodlee(
        createTestYodleeProviderAccount(yodleeProvider),
        userID,
        String(yodleeProvider.id),
      );

  await genCreateAccountLink(accountLink);
  return accountLink;
}

export async function genTestYodleePerformLink(
  accountLinkID: ID,
  desiredStatus: AccountLinkStatus,
  shouldUseMFA: boolean,
): Promise<void> {
  let accountLink = await genFetchAccountLink(accountLinkID);

  if (!accountLink) {
    const errorCode = 'infindi/server-error';
    const errorMessage = 'Trying to get test account link that does not exist';
    const toString = `[${errorCode}]: ${errorMessage}`;
    throw { errorCode, errorMessage, toString };
  }

  await sleepForMillis(3000);

  // STEP 2: FAILURE / BAD_CREDENTIALS
  if (desiredStatus === 'FAILURE / BAD_CREDENTIALS') {
    accountLink = updateAccountLinkStatus(
      accountLink,
      'FAILURE / BAD_CREDENTIALS',
    );
    await genCreateAccountLink(accountLink);
    return;
  }

  // STEP 3: MFA
  if (shouldUseMFA) {
    // MFA is not yet supported.
    accountLink = updateAccountLinkStatus(accountLink, 'FAILURE / MFA_FAILURE');
    await genCreateAccountLink(accountLink);
    return;
  }

  // STEP 4: IN_PROGRESS / DOWNLOAD_DATA
  accountLink = updateAccountLinkStatus(
    accountLink,
    'IN_PROGRESS / DOWNLOADING_DATA',
  );
  await genCreateAccountLink(accountLink);
  await sleepForMillis(8000);

  // STEP 5: desired status.
  accountLink = updateAccountLinkStatus(accountLink, desiredStatus);
  await genCreateAccountLink(accountLink);
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

// Creates a test yodlee provider account that has a status indicating it is
// currently logging in.
function createTestYodleeProviderAccount(
  yodleeProvider: YodleeProvider,
): YodleeProviderAccount {
  return {
    aggregationSource: 'SYSTEM',
    createdDate: '2018-04-01',
    id: 0,
    isManual: false,
    lastUpdated: '2018-04-01T00:00:00Z',
    providerId: yodleeProvider.id,
    refreshInfo: {
      additionalStatus: 'LOGIN_IN_PROGRESS',
      lastRefreshed: '2018-04-01T00:00:00Z',
      lastRefreshAttempt: '2018-04-01T00:00:00Z',
      statusCode: 0,
      status: 'IN_PROGRESS',
      statusMessage: 'blah',
    },
  };
}

function sleepForMillis(millis: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
}
