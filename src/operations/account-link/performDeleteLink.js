/* @flow */

import * as YodleeManager from '../../yodlee/yodlee-manager';
import AccountFetcher from 'common/lib/models/AccountFetcher';
import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkMutator from 'common/lib/models/AccountLinkMutator';
import AccountMutator from 'common/lib/models/AccountMutator';
import TransactionFetcher from 'common/lib/models/TransactionFetcher';
import TransactionMutator from 'common/lib/models/TransactionMutator';

import invariant from 'invariant';

import { ERROR, INFO } from '../../log-utils';

import type { ID } from 'common/types/core';
import type {
  SourceOfTruth$Empty as AccountLinkSourceOfTruth$Empty,
  SourceOfTruth$Yodlee as AccountLinkSourceOfTruth$Yodlee,
} from 'common/lib/models/AccountLink';

/**
 * Delete the link and all the data of the link. This will include:
 *
 * - Accounts that belong to the link
 * - Transactions that belong to the link
 * - If possible, a call will be made to the source of truth to delete all the
 *   data at the source.
 */
export default function performDeleteLink(accountLinkID: ID): void {
  genDeleteLinkImpl(accountLinkID).catch(error => {
    ERROR(
      'ACCOUNT-LINK',
      `LinkID=${accountLinkID}. Failed to delete. ${error}`,
    );
  });
}

/**
 * Separating the implementation from the interface so that we can use async
 * syntax
 */
async function genDeleteLinkImpl(accountLinkID): Promise<void> {
  INFO('ACCOUNT-LINK', `ID=${accountLinkID}. Started deleting account link`);

  // TODO: Edge case, we are currently linking the account. Need a way to remote
  // trigger a cancellation of the linking process and need a way to check
  // during the linking process that a remote delete was triggered. Should
  // also have tests that make sure this works correctly.

  const accountLink = await AccountLinkFetcher.genNullthrows(accountLinkID);
  const { sourceOfTruth } = accountLink;

  switch (sourceOfTruth.type) {
    case 'EMPTY': {
      INFO(
        'ACCOUNT-LINK',
        `ID=${accountLinkID}. Account link has no source of truth. Deleting empty link`,
      );
      await genDeleteLinkEmpty(
        accountLinkID,
        accountLink.userRef.refID,
        sourceOfTruth,
      );
      break;
    }

    case 'YODLEE': {
      INFO(
        'ACCOUNT-LINK',
        `ID=${accountLinkID}. Account link has comes from YODLEE. Deleting yodlee source of truth`,
      );
      await genDeleteLinkYodlee(
        accountLinkID,
        accountLink.userRef.refID,
        sourceOfTruth,
      );
      break;
    }

    default: {
      invariant(
        'Unrecognized account link source of truth: %s',
        sourceOfTruth.type,
      );
    }
  }
}

async function genDeleteLinkEmpty(
  accountLinkID: ID,
  userID: ID,
  sourceOfTruth: AccountLinkSourceOfTruth$Empty,
): Promise<void> {
  await AccountLinkMutator.genDelete(accountLinkID);
}

async function genDeleteLinkYodlee(
  accountLinkID: ID,
  userID: ID,
  sourceOfTruth: AccountLinkSourceOfTruth$Yodlee,
): Promise<void> {
  // NOTE: AccountLink has a set of Accounts, an Account has a set of
  // Transactions. We want to delete Transactions, then Accounts, then the
  // AccountLink. If we run into an error during the deletion process and we
  // end up with a partially-deleted account link, we want to make sure that
  // do not end up with transactions that have no accounts or accounts with
  // no link, so it is important to delete things in the correct order.

  // STEP 1: Delete the yodlee source of truth data.

  // NOTE: Deleting the yodlee provider account should automatically trigger
  // a deletion of the accounts and the transactions that belong to that
  // provider account.
  INFO('ACCOUNT-LINK', `ID=${accountLinkID}. Deleting provider account`);
  const providerAccountID = String(sourceOfTruth.providerAccount.id);
  // TODO: If the provider account is missing in yodlee, this will throw
  // an error. Would rather have it silently fail. Look into if this should
  // be an API change or just a local change.
  await YodleeManager.genDeleteProviderAccount(userID, providerAccountID);

  // STEP 2: Find and delete all transactions for the account link, including
  // at the source of truth.

  const transactions = await TransactionFetcher.genOrderedCollectionForAccountLink(
    accountLinkID,
    Infinity, // limit
  );
  INFO(
    'ACCOUNT-LINK',
    `ID=${accountLinkID}. Deleting ${transactions.size} transaction(s)`,
  );
  await TransactionMutator.genDeleteCollection(transactions);

  // STEP 2: Find and delete all accounts for the account link, including at
  // the source of truth.

  const accounts = await AccountFetcher.genCollectionFromAccountLink(
    accountLinkID,
  );
  INFO(
    'ACCOUNT-LINK',
    `ID=${accountLinkID}. Deleting ${accounts.size} accounts(s)`,
  );
  await AccountMutator.genDeleteCollection(accounts);

  // STEP 3: Delete the account link, including at the source of truth.
  INFO('ACCOUNT-LINK', `ID=${accountLinkID}. Deleting link`);
  await AccountLinkMutator.genDelete(accountLinkID);
}
