/* @flow */

import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkMutator from 'common/lib/models/AccountLinkMutator';

import invariant from 'invariant';

import { ERROR, INFO } from '../../log-utils';
import { genProviderAccountRefresh } from '../../yodlee/yodlee-manager';
import {
  genYodleeLinkPass,
  genYodleeUpdateLink,
  handleLinkingError,
} from './utils';

import type AccountLink from 'common/lib/models/AccountLink';

import type { ID } from 'common/types/core';
import type { ProviderAccount as YodleeProviderAccount } from 'common/types/yodlee-v1.0';

export async function genYodleeRefreshAccountLinksForUser(
  userID: ID,
): Promise<void> {
  const accountLinks = await AccountLinkFetcher.genCollectionForUser(userID);
  await Promise.all(
    accountLinks.map(link => genYodleeRefreshAccountLink(link)),
  );
}

export async function genYodleeRefreshAccountLink(
  accountLink: AccountLink,
  force: boolean = false,
): Promise<void> {
  if (accountLink.providerRef.refID === '0') {
    // Do not try to refresh test account.
    return;
  }
  await handleLinkingError(accountLink.id, () =>
    genYodleeRefreshAccountLinkImpl(accountLink, force),
  );
}

async function genYodleeRefreshAccountLinkImpl(
  accountLink: AccountLink,
  force: boolean,
): Promise<void> {
  if (
    accountLink.status === 'FAILURE / USER_INPUT_REQUEST_IN_BACKGROUND' ||
    accountLink.isInMFA ||
    (accountLink.isLinking && !force)
  ) {
    INFO(
      'ACCOUNT-LINK',
      `Skipping refresh for account link: ${accountLink.id} with status: ${
        accountLink.status
      }`,
    );
    return;
  }

  const userID = accountLink.userRef.refID;
  const yodleeProviderAccount = getYodleeProviderAccount(accountLink);
  await genProviderAccountRefresh(userID, String(yodleeProviderAccount.id));
  let newAccountLink = await genYodleeLinkPass(userID, accountLink.id);
  while (newAccountLink.isLinking) {
    await sleepForMillis(8000);
    newAccountLink = await genYodleeLinkPass(userID, accountLink.id);
  }
  // Fetch the new account link after the linking is done.
  invariant(
    newAccountLink,
    'Could not find account link while refreshing: %s',
    accountLink.id,
  );
  if (newAccountLink.isInMFA) {
    INFO('ACCOUNT-LINK', 'Making an MFA request during a background refresh');
    newAccountLink = newAccountLink.setStatus(
      'FAILURE / USER_INPUT_REQUEST_IN_BACKGROUND',
    );
    await AccountLinkMutator.genSet(newAccountLink);
    return;
  }
  if (!newAccountLink.isLinkSuccess) {
    ERROR(
      'ACCOUNT-LINK',
      `Refresh failed for account link ${
        accountLink.id
      }. Account link status: ${newAccountLink.status}`,
    );
    return;
  }
  INFO('ACCOUNT-LINK', `Refresh completed for account link ${accountLink.id}`);
  await genYodleeUpdateLink(newAccountLink);
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function getYodleeProviderAccount(
  accountLink: AccountLink,
): YodleeProviderAccount {
  invariant(
    accountLink.sourceOfTruth.type === 'YODLEE',
    'Expecting account link to come from yodlee: %s',
    accountLink.id,
  );
  return accountLink.sourceOfTruth.providerAccount;
}

async function sleepForMillis(millis: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
}
