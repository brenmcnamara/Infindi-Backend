/* @flow */

import * as FirebaseAdmin from 'firebase-admin';

import invariant from 'invariant';
import nullthrows from 'nullthrows';

import {
  createAccountYodlee,
  getAccountsCollection,
  genFetchAccountsForAccountLink,
  updateAccountYodlee,
} from 'common/lib/models/Account';
import {
  createSemaphore,
  wrapInSemaphoreRequest,
} from '../SingleThreadSemaphore';
import { genFetchAccountLinksForUser } from 'common/lib/models/AccountLink';
import { INFO } from '../log-utils';

import type { Account } from 'common/lib/models/Account';
import type { AccountLink } from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';
import type { ProviderAccount as YodleeProviderAccount } from 'common/types/yodlee';

import type YodleeClient from '../YodleeClient';

// Only 1 yodlee operation allowed at a time.
const yodleeSemaphore = createSemaphore(1);

export async function genUpdateLink(
  yodleeUserSession: string,
  yodleeClient: YodleeClient,
  accountLink: AccountLink,
): Promise<void> {
  INFO('ACCOUNT-LINK', 'Updating account link');

  const { sourceOfTruth } = accountLink;
  invariant(
    sourceOfTruth.type === 'YODLEE',
    'Expecting account link to come from Yodlee',
  );
  await genYodleeUpdateLink(yodleeUserSession, yodleeClient, accountLink);
}

export async function genUpdateLinksForUser(
  yodleeUserSession: string,
  yodleeClient: YodleeClient,
  userID: ID,
): Promise<void> {
  INFO('ACCOUNT-LINK', `Updating all account links for user ${userID}`);

  const accountLinks = await genFetchAccountLinksForUser(userID);
  await Promise.all(
    accountLinks.map(accountLink =>
      genUpdateLink(yodleeUserSession, yodleeClient, accountLink),
    ),
  );
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

export async function genYodleeUpdateLink(
  yodleeUserSession: string,
  yodleeClient: YodleeClient,
  accountLink: AccountLink,
): Promise<void> {
  const userID = accountLink.userRef.refID;
  const providerAccount = getYodleeProviderAccount(accountLink);
  // Fetch the yodlee accounts.
  const yodleeAccounts = await wrapInSemaphoreRequest(yodleeSemaphore, () =>
    yodleeClient.genAccountsForProviderAccount(
      yodleeUserSession,
      String(providerAccount.id),
    ),
  );

  // Update existing accounts, create new accounts, delete old accounts.
  const yodleeAccountStatusMap = {};
  const prevAccounts = await genFetchAccountsForAccountLink(accountLink.id);

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
        const newAccount = updateAccountYodlee(account, yodleeAccount);
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
        const newAccount = createAccountYodlee(
          yodleeAccount,
          accountLink.id,
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

function getYodleeProviderAccount(
  accountLink: AccountLink,
): YodleeProviderAccount {
  invariant(
    accountLink.sourceOfTruth.type === 'YODLEE',
    'Expected provider Account to come from Yodlee',
  );
  return accountLink.sourceOfTruth.providerAccount;
}
