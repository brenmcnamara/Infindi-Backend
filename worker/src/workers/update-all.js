/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Common from 'common';
import CommonBackend from 'common-backend';

import genNetWorth from '../calculations/genNetWorth';
import genSavingsRate from '../calculations/genSavingsRate';
import getAccountFromPlaidAccount from '../calculations/getAccountFromPlaidAccount';
import getTransactionFromPlaidTransaction from '../calculations/getTransactionFromPlaidTransaction';
import invariant from 'invariant';

import { forEachObject } from '../obj-utils';
import { genPlaidAccounts, genPlaidTransactions } from '../plaid-client';
import { ERROR, INFO } from '../log-utils';

import type { Account } from 'common/lib/models/Account';
import type { ID } from 'common/types/core';
import type { PlaidCredentials } from 'common/lib/models/PlaidCredentials';
import type { UserMetrics } from 'common/lib/models/UserMetrics';

const { Job } = CommonBackend;

export function initialize(workerID: ID): void {
  INFO('INITIALIZATION', 'Initializing update-account worker');
  Job.listenToJobRequest('UPDATE_ALL', workerID, genUpdateAll);
}

// TODO: Create a better group than PLAID
async function genUpdateAll(payload: Object) {
  INFO('PLAID', `Updating all user data: ${payload.userID}`);
  const userID: ID = payload.userID;

  INFO('PLAID', 'Fetch all credentials and accounts for the given user');
  const [credentialsMap, accountMap] = await Promise.all([
    genAllPlaidCredentials(userID),
    genAllAccounts(userID),
  ]);

  // Keep track of the download status of credentials, in case we need to
  // roll them back during a failure.
  const downloadStatusMap = {};

  // Remove any credentials that are downloading. There could be another process
  // in the middle of downloading credentials.
  forEachObject(credentialsMap, credentials => {
    if (credentials.downloadStatus.type === 'RUNNING') {
      delete credentialsMap[credentials.id];
    } else {
      downloadStatusMap[credentials.id] = credentials.downloadStatus;
    }
  });

  // Get the earliest date of transactions we need to fetch. We will just
  // use the earliest date of all credentials.
  const startDate = getStartDate(credentialsMap);
  INFO(
    'PLAID',
    `Start date for fetching transactions is ${startDate.toString()}`,
  );

  INFO('PLAID', 'Marking all plaid credentials as downloading');
  const credentialsBatch = FirebaseAdmin.firestore().batch();
  forEachObject(credentialsMap, credentials => {
    const ref = FirebaseAdmin.firestore()
      .collection('PlaidCredentials')
      .doc(credentials.id);
    const newCredentials = {
      ...Common.DBUtils.updateModelStub(credentials),
      downloadStatus: { type: 'RUNNING' },
    };
    credentialsMap[newCredentials.id] = newCredentials;
    credentialsBatch.update(ref, newCredentials);
  });

  await credentialsBatch.commit();

  try {
    const batch = FirebaseAdmin.firestore().batch();

    INFO(
      'PLAID',
      'Fetching all plaid accounts and transactions for the current user',
    );
    const updates = [];

    forEachObject(credentialsMap, credentials => {
      // Update all the accounts for these credentials.
      const accountsUpdate = genPlaidAccounts(credentials).then(
        plaidAccounts => {
          plaidAccounts.forEach(plaidAccount => {
            const oldAccount: ?Account = accountMap[plaidAccount.account_id];
            let newAccount: Account;
            if (oldAccount) {
              newAccount = {
                ...getAccountFromPlaidAccount(plaidAccount, credentials),
                createdAt: oldAccount.createdAt,
              };
            } else {
              newAccount = getAccountFromPlaidAccount(
                plaidAccount,
                credentials,
              );
            }
            const ref = FirebaseAdmin.firestore()
              .collection('Accounts')
              .doc(newAccount.id);
            batch.set(ref, newAccount);
          });
        },
      );

      updates.push(accountsUpdate);

      // Update all the transactions for these credentials.

      const transactionsUpdate = genPlaidTransactions(credentials, {
        startDate,
      }).then(plaidTransactions => {
        const count = plaidTransactions.length;
        INFO(
          'PLAID',
          `Adding / updating ${count} for credentials ${credentials.id}`,
        );
        plaidTransactions.forEach(plaidTransaction => {
          const newTransaction = getTransactionFromPlaidTransaction(
            plaidTransaction,
            credentials,
          );
          const ref = FirebaseAdmin.firestore()
            .collection('Transactions')
            .doc(newTransaction.id);
          // TODO: CreatedAt flag for transactions is getting reset every time
          // this is done. May want an efficient way to make sure we don't
          // overwrite this.
          batch.set(ref, newTransaction);
        });
      });

      updates.push(transactionsUpdate);
    });

    INFO('PLAID', 'Waiting for plaid updates to set changes to batch process');
    await Promise.all(updates);

    INFO('PLAID', 'Submitting batched update to firestore');
    await batch.commit();

    INFO('PLAID', 'Updating user core metrics');
    // TODO: We just updated all the account and transaction of the user,
    // and now we are going to use that to update the user metrics. Is it
    // possible that we may be waiting for database consistency to happen?
    // Could we accidentally get stale data here for the account and
    // transactions of a user?
    const [netWorth, savingsRate] = await Promise.all([
      genNetWorth(userID),
      genSavingsRate(userID),
    ]);

    const userMetrics = await genUserMetrics(userID);
    const updatedMetrics: UserMetrics = {
      ...Common.DBUtils.updateModelStub(userMetrics),
      id: userID,
      netWorth,
      savingsRate,
    };

    await genUpdateUserMetrics(updatedMetrics);
  } catch (error) {
    ERROR('PLAID', `UPDATE_ALL failed: [${error.toString()}]`);
    ERROR('PLAID', 'Rolling back download status of credentials');
    // Failed to update. Need to make sure that we roll back credentials before
    // propagating the error.
    const failedBatch = FirebaseAdmin.firestore().batch();
    forEachObject(credentialsMap, credentials => {
      const ref = FirebaseAdmin.firestore()
        .collection('PlaidCredentials')
        .doc(credentials.id);
      const downloadStatus = downloadStatusMap[credentials.id] || {
        type: 'NOT_DOWNLOADED',
      };
      const updatedCredentials = {
        ...Common.DBUtils.updateModelStub(credentials),
        downloadStatus,
      };
      failedBatch.update(ref, updatedCredentials);
    });

    await failedBatch.commit();
    throw error;
  }

  INFO('PLAID', 'Update finished successfully');
  const successBatch = FirebaseAdmin.firestore().batch();
  forEachObject(credentialsMap, credentials => {
    const ref = FirebaseAdmin.firestore()
      .collection('PlaidCredentials')
      .doc(credentials.id);
    const now = new Date();
    const updatedCredentials = {
      ...Common.DBUtils.updateModelStub(credentials),
      downloadStatus: {
        downloadedAt: now,
        type: 'COMPLETE',
      },
    };
    successBatch.set(ref, updatedCredentials);
  });

  await successBatch.commit();
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

type JSONMap<K: string, V> = { [key: K]: V };

async function genAllPlaidCredentials(
  userID: ID,
): Promise<JSONMap<ID, PlaidCredentials>> {
  const snapshot = await FirebaseAdmin.firestore()
    .collection('PlaidCredentials')
    .where('userRef.refID', '==', userID)
    .get();
  const map = {};
  snapshot.docs.forEach(doc => {
    if (!doc.exists) {
      return;
    }
    const credentials = doc.data();
    map[credentials.id] = credentials;
  });
  return map;
}

async function genAllAccounts(userID: ID): Promise<JSONMap<ID, Account>> {
  const snapshot = await FirebaseAdmin.firestore()
    .collection('Accounts')
    .where('userRef.refID', '==', userID)
    .get();
  const map = {};
  snapshot.docs.forEach(doc => {
    if (!doc.exists) {
      return;
    }
    const account: Account = doc.data();
    map[account.id] = account;
  });
  return map;
}

async function genUserMetrics(userID: ID): Promise<UserMetrics> {
  const document = await FirebaseAdmin.firestore()
    .collection('UserMetrics')
    .doc(userID)
    .get();

  invariant(
    document.exists,
    'Expected user metrics for user to exist: %s',
    userID,
  );
  return document.data();
}

async function genUpdateUserMetrics(userMetrics: UserMetrics): Promise<void> {
  await FirebaseAdmin.firestore()
    .collection('UserMetrics')
    .doc(userMetrics.id)
    .set(userMetrics);
}

// This is the date we need to fetch our credentials from.
function getStartDate(credentialsMap: JSONMap<ID, PlaidCredentials>): Date {
  const date: ?Date = Common.ObjUtils.reduceObject(
    credentialsMap,
    (earliest, credentials) => {
      const { downloadStatus } = credentials;
      if (downloadStatus.type !== 'COMPLETE') {
        return earliest;
      }
      const { downloadedAt } = downloadStatus;
      if (!earliest || earliest.getTime() > downloadedAt.getTime()) {
        return downloadedAt;
      }
      return earliest;
    },
    null,
  );
  return date || new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
}
