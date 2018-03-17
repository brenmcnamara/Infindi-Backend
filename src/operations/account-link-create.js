/* @flow */

import invariant from 'invariant';

import {
  createAccountLinkYodlee,
  genCreateAccountLink,
  genFetchAccountLink,
  genFetchAccountLinkForProvider,
  isLinking,
  isLinkFailure,
  isLinkSuccess,
  updateAccountLinkYodlee,
} from 'common/lib/models/AccountLink';
import { genCheckAndRefreshYodleeUserSession } from '../yodlee-manager';
import { genUpdateLink } from './account-link-update';
import { INFO } from '../log-utils';

import type YodleeClient from '../YodleeClient';

import type { AccountLink } from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';
import type { ProviderFull as YodleeProvider } from 'common/types/yodlee';

export async function genYodleeProviderLogin(
  yodleeUserSession: string,
  yodleeClient: YodleeClient,
  yodleeProvider: YodleeProvider,
  userID: ID,
): Promise<AccountLink> {
  INFO('ACCOUNT-LINK', 'Linking yodlee account');

  const loginPayload = await yodleeClient.genProviderLogin(
    yodleeUserSession,
    yodleeProvider,
  );
  const providerID = String(yodleeProvider.id);
  const providerAccountID = String(loginPayload.providerAccountId);
  const yodleeProviderAccount = await yodleeClient.genProviderAccount(
    yodleeUserSession,
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
  const refreshInfo: AccountLink = existingAccountLink
    ? updateAccountLinkYodlee(existingAccountLink, yodleeProviderAccount)
    : createAccountLinkYodlee(yodleeProviderAccount, userID, providerID);

  INFO('ACCOUNT-LINK', 'Creating / Updating refresh info');
  await genCreateAccountLink(refreshInfo);
  return refreshInfo;
}

export async function genYodleePerformLink(
  yodleeUserSession: string,
  client: YodleeClient,
  accountLinkID: ID,
): Promise<void> {
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
  let isDoneProcessing = await genYodleeLinkPass(
    yodleeUserSession,
    client,
    accountLinkID,
  );
  const sleepTime = 3000;
  while (!isDoneProcessing) {
    INFO('ACCOUNT-LINK', 'Account linking is not complete, trying again');
    await sleepForMillis(sleepTime);
    yodleeUserSession = await genCheckAndRefreshYodleeUserSession(userID);
    INFO('ACCOUNT-LINK', 'Checking if account has finished linking');
    isDoneProcessing = await genYodleeLinkPass(
      yodleeUserSession,
      client,
      accountLinkID,
    );
  }

  INFO('ACCOUNT-LINK', 'Yodlee has completed linking attempt');
  accountLink = await genFetchAccountLink(accountLinkID);
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
  await genUpdateLink(yodleeUserSession, client, accountLink);
  INFO('ACCOUNT-LINK', 'Finished downloading account link data');
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

async function genYodleeLinkPass(
  yodleeUserSession: string,
  yodleeClient: YodleeClient,
  accountLinkID: ID,
): Promise<bool> {
  INFO('ACCOUNT-LINK', 'Attempting provider link');

  const accountLink = await genFetchAccountLink(accountLinkID);
  invariant(
    accountLink,
    'No refresh info found while attempting provider link',
  );

  const { sourceOfTruth } = accountLink;
  invariant(
    sourceOfTruth.type === 'YODLEE',
    'Expecting account link to come from Yodlee',
  );
  const yodleeProviderAccountID = String(sourceOfTruth.providerAccount.id);

  const yodleeProviderAccount = await yodleeClient.genProviderAccount(
    yodleeUserSession,
    yodleeProviderAccountID,
  );

  invariant(
    yodleeProviderAccount,
    'Expecting yodlee provider account to exist if an account link exists for it',
  );

  INFO('ACCOUNT-LINK', 'Updating account link');
  const newAccountLink = updateAccountLinkYodlee(
    accountLink,
    yodleeProviderAccount,
  );
  await genCreateAccountLink(newAccountLink);
  return !isLinking(accountLink);
}

function sleepForMillis(millis: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
}
