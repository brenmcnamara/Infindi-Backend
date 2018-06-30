/* @flow */

import * as Immutable from 'immutable';
import * as YodleeManager from '../../../yodlee/yodlee-manager';
import Account from 'common/lib/models/Account';
import AccountFetcher from 'common/lib/models/AccountFetcher';
import AccountLinkMutator from 'common/lib/models/AccountLinkMutator';
import AccountMutator from 'common/lib/models/AccountMutator';
import LinkState from './LinkState';
import LinkUtils from './LinkUtils';
import Transaction from 'common/lib/models/Transaction';
import TransactionFetcher from 'common/lib/models/TransactionFetcher';
import TransactionMutator from 'common/lib/models/TransactionMutator';

import invariant from 'invariant';
import nullthrows from 'nullthrows';

import { INFO } from '../../../log-utils';

import type AccountLink from 'common/lib/models/AccountLink';
import type LinkEngine from './LinkEngine';

import type { AccountCollection } from 'common/lib/models/Account';
import type { ID } from 'common/types/core';
import type { LinkEvent } from './LinkEvent';

/**
 * Enter this state when we are ready to sync the source of truth of the
 * link to the internal datastores (i.e. Download yodlee data into firebase).
 */
export default class SyncWithSourceState extends LinkState {
  _accountLink: AccountLink;

  constructor(accountLink: AccountLink) {
    super();
    this._accountLink = accountLink;
  }

  calculateNextState(event: LinkEvent): LinkState {
    const state = LinkUtils.calculateStateForSuccessOrFailureEvent(event);
    if (state) {
      return state;
    }
    return this;
  }

  async didEnterState(
    fromState: LinkState | null,
    engine: LinkEngine,
  ): Promise<void> {
    INFO(
      'ACCOUNT-LINK',
      `LinkID=${this.__accountLinkID} New State: SyncWithSourceState`,
    );

    await AccountLinkMutator.genSet(
      this._accountLink.setStatus('IN_PROGRESS / DOWNLOADING_FROM_SOURCE'),
    );

    await this._genUpdateAccounts(this._accountLink);

    // TODO: May need to refetch the account link at this point. Could be
    // stale after all the above operations have completed.
    await AccountLinkMutator.genSet(this._accountLink.setStatus('SUCCESS'));
  }

  async _genUpdateAccounts(accountLink: AccountLink): Promise<void> {
    const providerAccountID = getProviderAccountID(accountLink);
    const userID = accountLink.userRef.refID;

    const staleAccounts: AccountCollection = await AccountFetcher.genCollectionFromAccountLink(
      accountLink.id,
    );

    const yodleeAccounts = await YodleeManager.genAccountsForProviderAccount(
      userID,
      providerAccountID,
    );

    // Figure out which accounts were deleted since the last refresh.
    const deletingAccounts: AccountCollection = staleAccounts.filter(
      account =>
        !yodleeAccounts.some(
          yodleeAccount =>
            account.sourceOfTruth.type === 'YODLEE' &&
            account.sourceOfTruth.value.id === yodleeAccount.id,
        ),
    );

    // Figure out which accounts to create.
    const creatingAccounts: AccountCollection = Immutable.Map(
      yodleeAccounts
        // Filter out accounts that already exist.
        .filter(
          yodleeAccount =>
            !staleAccounts.some(
              account =>
                account.sourceOfTruth.type === 'YODLEE' &&
                account.sourceOfTruth.value.id === yodleeAccount.id,
            ),
        )
        .map(yodleeAccount => {
          const account = Account.createYodlee(
            yodleeAccount,
            accountLink.id,
            userID,
          );
          return [account.id, account];
        }),
    );

    // Figure out which accounts we need to update.
    const updatingAccounts: AccountCollection = staleAccounts
      .filter(
        account =>
          !deletingAccounts.has(account.id) &&
          !creatingAccounts.some(
            rhs =>
              account.sourceOfTruth.type === 'YODLEE' &&
              rhs.sourceOfTruth.type === 'YODLEE' &&
              account.sourceOfTruth.value.id === rhs.sourceOfTruth.value.id,
          ),
      )
      .map(account => {
        invariant(
          account.sourceOfTruth.type === 'YODLEE',
          'Expecting account to come from YODLEE',
        );
        const yodleeAccountID = account.sourceOfTruth.value.id;
        const yodleeAccount = nullthrows(
          yodleeAccounts.find(
            yodleeAccount => yodleeAccount.id === yodleeAccountID,
          ),
        );
        return account.setYodlee(yodleeAccount);
      });

    const settingAccounts = creatingAccounts.merge(updatingAccounts);

    INFO(
      'ACCOUNT-LINK',
      `LinkID=${accountLink.id} - Creating ${creatingAccounts.size} account(s)`,
    );
    INFO(
      'ACCOUNT-LINK',
      `LinkID=${accountLink.id} - Updating ${updatingAccounts.size} account(s)`,
    );
    INFO(
      'ACCOUNT-LINK',
      `LinkID=${accountLink.id} - Deleting ${deletingAccounts.size} account(s)`,
    );

    await Promise.all([
      AccountMutator.genSetCollection(settingAccounts),
      AccountMutator.genDeleteCollection(deletingAccounts),
      Promise.all(
        settingAccounts
          .map(account => this._genUpdateTransactions(account))
          .toArray(),
      ),
    ]);
  }

  async _genUpdateTransactions(account: Account): Promise<void> {
    const userID = account.userRef.refID;
    const yodleeAccountID = getYodleeAccountID(account);

    const collection = await TransactionFetcher.genOrderedCollectionForAccount(
      account.id,
      1, // limit
    );

    // NOTE: Because transaction dates are rounded to the nearest date, there
    // is a high likelihood that the transaction fetched is not necessarily
    // the last transaction.
    const approximateLatestTransaction = collection.first() || null;

    if (!approximateLatestTransaction) {
      // This is the first time we are fetching transactions for this account.
      // Fetch everything we can, and upload it to our DB.
      const yodleeTransactions = await YodleeManager.genTransactions(
        userID,
        yodleeAccountID,
      );
      const transactions = Immutable.Map(
        yodleeTransactions.map(yodleeTransaction => {
          const transaction = Transaction.createYodlee(
            yodleeTransaction,
            userID,
            account.id,
            account.accountLinkRef.refID,
          );
          return [transaction.id, transaction];
        }),
      );
      INFO(
        'ACCOUNT-LINK',
        `LinkID=${account.accountLinkRef.refID} - AccountID=${
          account.id
        } - Creating ${transactions.size} transaction(s)`,
      );
      await TransactionMutator.genSetCollection(transactions);
      return;
    }

    const yodleeTransactions = await YodleeManager.genTransactionsFromDate(
      userID,
      yodleeAccountID,
      approximateLatestTransaction.transactionDate,
    );

    const doesYodleeTransactionExist = await Promise.all(
      yodleeTransactions.map(yodleeTransaction =>
        Transaction.FirebaseCollectionUNSAFE.where(
          'sourceOfTruth.type',
          '==',
          'YODLEE',
        )
          .where('sourceOfTruth.value.id', '==', yodleeTransaction.id)
          .get()
          .then(snapshot => snapshot.docs[0] && snapshot.docs[0].exists),
      ),
    );

    const newTransactions = Immutable.Map(
      yodleeTransactions
        .filter((_, index) => !doesYodleeTransactionExist[index])
        .map(yodleeTransaction => {
          const transaction = Transaction.createYodlee(
            yodleeTransaction,
            userID,
            account.id,
            account.accountLinkRef.refID,
          );
          return [transaction.id, transaction];
        }),
    );

    INFO(
      'ACCOUNT-LINK',
      `LinkID=${account.accountLinkRef.refID} - AccountID=${
        account.id
      } - Creating ${newTransactions.size} transaction(s)`,
    );

    await TransactionMutator.genSetCollection(newTransactions);
  }
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function getProviderAccountID(accountLink: AccountLink): ID {
  invariant(
    accountLink.sourceOfTruth.type === 'YODLEE',
    'Expecting account link to come from YODLEE',
  );
  const { providerAccount } = accountLink.sourceOfTruth;
  return String(providerAccount.id);
}

function getYodleeAccountID(account: Account): ID {
  invariant(
    account.sourceOfTruth.type === 'YODLEE',
    'Expecting account to come from YODLEE',
  );
  const yodleeAccount = account.sourceOfTruth.value;
  return String(yodleeAccount.id);
}
