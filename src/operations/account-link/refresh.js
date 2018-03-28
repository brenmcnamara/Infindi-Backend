/* @flow */

import invariant from 'invariant';

import { ERROR, INFO } from '../../log-utils';
import {
  genFetchAccountLink,
  genFetchAccountLinksForUser,
  isLinking,
  isLinkSuccess,
} from 'common/lib/models/AccountLink';
import { genProviderAccountRefresh } from '../../yodlee-manager';
import { genYodleeLinkPass, genYodleeUpdateLink } from './utils';

import type { AccountLink } from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';
import type { ProviderAccount as YodleeProviderAccount } from 'common/types/yodlee';

export async function genYodleeRefreshAccountLinksForUser(
  userID: ID,
): Promise<void> {
  const accountLinks = await genFetchAccountLinksForUser(userID);
  await Promise.all(
    accountLinks.map(link => genYodleeRefreshAccountLink(link)),
  );
}

export async function genYodleeRefreshAccountLink(
  accountLink: AccountLink,
  force: bool = false,
): Promise<void> {
  invariant(
    force || !isLinking(accountLink),
    'Trying to link account link that is already linking: %s',
    accountLink.id,
  );
  const userID = accountLink.userRef.refID;
  const yodleeProviderAccount = getYodleeProviderAccount(accountLink);
  await genProviderAccountRefresh(userID, String(yodleeProviderAccount.id));
  let isDoneLinking = await genYodleeLinkPass(userID, accountLink.id);
  while (!isDoneLinking) {
    await sleepFor(5000);
    isDoneLinking = await genYodleeLinkPass(userID, accountLink.id);
  }
  // Fetch the new account link after the linking is done.
  const newAccountLink = await genFetchAccountLink(accountLink.id);
  invariant(
    newAccountLink,
    'Could not find account link while refreshing: %s',
    accountLink.id,
  );
  if (!isLinkSuccess(newAccountLink)) {
    ERROR('ACCOUNT-LINK', `Refresh failed for account link ${accountLink.id}`);
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

async function sleepFor(millis: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
}
