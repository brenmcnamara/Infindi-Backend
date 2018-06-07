/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Account from 'common/lib/models/Account';
import AccountFetcher from 'common/lib/models/AccountFetcher';
import AccountLink from 'common/lib/models/AccountLink';
import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkMutator from 'common/lib/models/AccountLinkMutator';
import Logger from './logger';
import Transaction from 'common/lib/models/Transaction';
import TransactionFetcher from 'common/lib/models/TransactionFetcher';
import TransactionMutator from 'common/lib/models/TransactionMutator';

import invariant from 'invariant';
import nullthrows from 'nullthrows';

import { ERROR, INFO } from '../../log-utils';
import {
  genAccountsForProviderAccount,
  genProviderAccount,
  genTransactions,
  genTransactionsFromDate,
} from '../../yodlee/yodlee-manager';

import type { ID } from 'common/types/core';
import type { ProviderAccount as YodleeProviderAccount } from 'common/types/yodlee-v1.0';
import type { TransactionOrderedCollection } from 'common/lib/models/Transaction';

export function handleLinkingError(
  accountLinkID: ID,
  cb: () => Promise<*>,
): Promise<*> {
  return cb().catch(error => {
    const errorMessage =
      error.errorMessage ||
      error.error_message ||
      error.message ||
      error.toString();
    ERROR(
      'ACCOUNT-LINK',
      `Error while linking account: [${accountLinkID}] ${errorMessage}`,
    );
    AccountLinkFetcher.gen(accountLinkID)
      .then(accountLink => {
        invariant(accountLink, 'Failed to fetch account link in error handler');
        const newAccountLink = accountLink.setStatus(
          'FAILURE / INTERNAL_SERVICE_FAILURE',
        );
        Logger.genStop(newAccountLink);
        return AccountLinkMutator.genSet(newAccountLink);
      })
      .catch(error => {
        const errorMessage =
          error.errorMessage ||
          error.error_message ||
          error.message ||
          error.toString();
        ERROR(
          'ACCOUNT-LINK',
          // eslint-disable-next-line max-len
          `Double Error!! Failed to update account link status to error status: [${accountLinkID}] ${errorMessage}`,
        );
      });
  });
}

export async function genUpdateLink(accountLink: AccountLink): Promise<void> {
  INFO('ACCOUNT-LINK', 'Updating account link');

  const { sourceOfTruth } = accountLink;
  invariant(
    sourceOfTruth.type === 'YODLEE',
    'Expecting account link to come from Yodlee',
  );
  await genYodleeUpdateLink(accountLink);
}

export async function genUpdateLinksForUser(userID: ID): Promise<void> {
  INFO('ACCOUNT-LINK', `Updating all account links for user ${userID}`);

  const accountLinks = await AccountLinkFetcher.genCollectionForUser(userID);
  await Promise.all(
    accountLinks.map(accountLink => genUpdateLink(accountLink)),
  );
}

export async function genYodleeLinkPass(
  userID: ID,
  accountLinkID: ID,
): Promise<AccountLink> {
  INFO('ACCOUNT-LINK', 'Attempting provider link');

  const accountLink = await AccountLinkFetcher.gen(accountLinkID);
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

  const yodleeProviderAccount = await genProviderAccount(
    userID,
    yodleeProviderAccountID,
  );

  invariant(
    yodleeProviderAccount,
    'Expecting yodlee provider account to exist if an account link exists for it',
  );

  INFO('ACCOUNT-LINK', 'Updating account link');
  const newAccountLink = accountLink.setYodlee(yodleeProviderAccount);
  await AccountLinkMutator.genSet(newAccountLink);
  // NOTE: If we are pending user input, then assume that the client will take
  // care of this asyncronously. This pass fails until the user input is
  // provided successfully.
  return newAccountLink;
}

export async function genYodleeUpdateLink(
  accountLink: AccountLink,
): Promise<void> {
  const userID = accountLink.userRef.refID;
  const providerAccount = getYodleeProviderAccount(accountLink);
  // Fetch the yodlee accounts.
  const yodleeAccounts = await genAccountsForProviderAccount(
    userID,
    String(providerAccount.id),
  );

  // Update existing accounts, create new accounts, delete old accounts.
  const yodleeAccountStatusMap = {};
  const prevAccounts = await AccountFetcher.genCollectionFromAccountLink(
    accountLink.id,
  );

  // Figure out which accounts need to be updated or deleted.
  prevAccounts.forEach(prevAccount => {
    const stillExists = yodleeAccounts.some(yAccount =>
      doesAccountMatchYodleeAccountID(prevAccount, String(yAccount.id)),
    );
    const prevYodleeAccountID = getYodleeAccountID(prevAccount);
    yodleeAccountStatusMap[prevYodleeAccountID] = stillExists
      ? 'UPDATE'
      : 'DELETE';
  });

  // Any accounts that are not marked as updated or deleted should be created.
  for (const yodleeAccount of yodleeAccounts) {
    const yodleeAccountID = String(yodleeAccount.id);
    if (!yodleeAccountStatusMap[yodleeAccountID]) {
      yodleeAccountStatusMap[yodleeAccountID] = 'CREATE';
    }
  }

  const batch = FirebaseAdmin.firestore().batch();

  let updateCount = 0;
  let deleteCount = 0;
  let createCount = 0;
  const createdOrUpdatedAccounts = [];
  const deletedAccounts = [];

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
        const ref = Account.FirebaseCollectionUNSAFE.doc(account.id);
        const newAccount = account.setYodlee(yodleeAccount);
        batch.update(ref, newAccount.toRaw());

        createdOrUpdatedAccounts.push(newAccount);
        ++updateCount;
        break;
      }

      case 'DELETE': {
        const account = nullthrows(
          prevAccounts.find(a =>
            doesAccountMatchYodleeAccountID(a, yodleeAccountID),
          ),
        );
        const ref = Account.FirebaseCollectionUNSAFE.doc(account.id);
        batch.delete(ref);

        deletedAccounts.push(account);
        ++deleteCount;
        break;
      }

      case 'CREATE': {
        const yodleeAccount = nullthrows(
          yodleeAccounts.find(ya => String(ya.id) === yodleeAccountID),
        );
        const newAccount = Account.createYodlee(
          yodleeAccount,
          accountLink.id,
          userID,
        );
        const ref = Account.FirebaseCollectionUNSAFE.doc(newAccount.id);
        batch.set(ref, newAccount.toRaw());

        createdOrUpdatedAccounts.push(newAccount);
        ++createCount;
        break;
      }

      default:
        invariant(false, 'Unexpected account status: %s', status);
    }
  }

  INFO(
    'ACCOUNT-LINK',
    //eslint-disable-next-line max-len
    `${updateCount} account(s) updated. ${deleteCount} account(s) deleted. ${createCount} account(s) created.`,
  );
  await batch.commit();
  await Promise.all([
    genYodleeCreateTransactions(accountLink, createdOrUpdatedAccounts),
    genYodleeDeleteTransactions(accountLink, deletedAccounts),
  ]);
}

async function genYodleeDeleteTransactions(
  accountLink: AccountLink,
  accounts: Array<Account>,
): Promise<void> {
  // NOTE: We are assuming that the number of transactions that we are
  // deleting here is reasonably small so we do not result in out-of-memory
  // errors. This assumption may need to be removed in the future for more
  // efficient deletes.
  if (accounts.length === 0) {
    return;
  }
  INFO(
    'ACCOUNT-LINK',
    `Deleting transactions for account link ${accountLink.id}`,
  );
  // eslint-disable-next-line flowtype/generic-spacing
  const transactionsList: Array<
    TransactionOrderedCollection,
  > = await Promise.all(
    accounts.map(account =>
      TransactionFetcher.genOrderedCollectionForAccount(
        account.id,
        Infinity /* limit */,
      ),
    ),
  );

  const batches = [];
  let transactionCount = 0;

  for (const transactions of transactionsList) {
    transactions.forEach(transaction => {
      // Only aloud 500 batched operations at a time.
      if (transactionCount % 500 === 0) {
        batches.push(FirebaseAdmin.firestore().batch());
      }
      const ref = Transaction.FirebaseCollectionUNSAFE.doc(transaction.id);
      batches[batches.length - 1].delete(ref);
      ++transactionCount;
    });
  }

  INFO(
    'ACCOUNT-LINK',
    `Deleting ${transactionCount} transaction(s) from account link ${
      accountLink.id
    }`,
  );
  await Promise.all(batches.map(b => b.commit()));
}

async function genYodleeCreateTransactions(
  accountLink: AccountLink,
  accounts: Array<Account>,
): Promise<void> {
  const userID = accountLink.userRef.refID;
  // NOTE: In this function, we are making the assumption that transactions
  // are immutable. Once one is created, it will never be modified. We are also
  // assuming that transactions are added chronologically, so a transaction that
  // happened 5 days ago cannot be added after a transaction that hapenned
  // yesterday. Under these assumptions, we only need to add transactions that
  // have occured after the date of our last transaction. No modifying or
  // deleting of transactions. These assumptions are fine for now, but may need
  // to be modified in the future.
  INFO(
    'ACCOUNT-LINK',
    `Creating transactions for account link ${accountLink.id}`,
  );

  // Step 1: Get the most recent transaction for each account. We only want to
  // fetch accounts after the latest transaction.

  // eslint-disable-next-line flowtype/generic-spacing
  const transactionsList: Array<
    TransactionOrderedCollection,
  > = await Promise.all(
    accounts.map(account =>
      TransactionFetcher.genOrderedCollectionForAccount(
        account.id,
        1, // limit
      ),
    ),
  );

  const accountToLastTransactionMap = {};
  transactionsList.forEach((transactions, index) => {
    const transaction = transactions.first() || null;
    accountToLastTransactionMap[accounts[index].id] = transaction;
  });

  // Step 2: Go through each account and fetch the transactions from yodlee
  // after the last transaction we currently have for the account.
  const allNewTransactions = [];
  for (const accountID in accountToLastTransactionMap) {
    if (!accountToLastTransactionMap.hasOwnProperty(accountID)) {
      continue;
    }
    // NOTE: Yodlee does not like concurrent requests so we will do this
    // in sequence. This is not ideal, but out of our control.
    const lastTransaction = accountToLastTransactionMap[accountID];

    // TODO: Should pass in an object instead of an array to avoid having
    // to enumerate the accounts array.
    const account = nullthrows(accounts.find(a => a.id === accountID));
    const yodleeAccountID = getYodleeAccountID(account);
    let newYodleeTransactions = lastTransaction
      ? await genTransactionsFromDate(
          userID,
          yodleeAccountID,
          lastTransaction.transactionDate,
        )
      : await genTransactions(userID, yodleeAccountID);

    if (!newYodleeTransactions || newYodleeTransactions.length === 0) {
      continue;
    }
    // NOTE: Because transaction dates are not perfectly accurate (rounded to
    // the nearest day), this will result in some overlap on the days, so we
    // need to make sure that we are excluding any transactions that have

    const doesTransactionExist = await Promise.all(
      newYodleeTransactions.map(yodleeTransaction =>
        TransactionFetcher.genForYodleeTransaction(yodleeTransaction),
      ),
    );

    newYodleeTransactions = newYodleeTransactions.filter(
      (yt, i) => !doesTransactionExist[i],
    );

    const newTransactions = newYodleeTransactions.map(yodleeTransaction =>
      Transaction.createYodlee(yodleeTransaction, userID, accountID),
    );
    allNewTransactions.push.apply(allNewTransactions, newTransactions);
  }

  INFO(
    'ACCOUNT-LINK',
    `Creating ${allNewTransactions.length} transaction(s) for link ${
      accountLink.id
    }`,
  );
  await Promise.all(allNewTransactions.map(t => TransactionMutator.genSet(t)));
}

function doesAccountMatchYodleeAccountID(
  account: Account,
  yodleeAccountID: ID,
): boolean {
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
