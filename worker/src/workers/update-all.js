/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import Common from 'common';
import CommonBackend from 'common-backend';

import genNetWorth from '../calculations/genNetWorth';
import genSavingsRate from '../calculations/genSavingsRate';
import getAccountFromPlaidAccount from '../calculations/getAccountFromPlaidAccount';
import getTransactionFromPlaidTransaction from '../calculations/getTransactionFromPlaidTransaction';

import { forEachObject } from '../obj-utils';
import { genPlaidAccounts, genPlaidTransactions } from '../plaid-client';
import { ERROR, INFO } from '../log-utils';

import type {
  Account,
  PlaidCredentials,
  UserMetrics,
} from 'common/src/types/db';
import type { ID } from 'common/src/types/core';

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

    INFO('PLAID', 'Updating user core metrics');
    const [netWorth, savingsRate] = await Promise.all([
      genNetWorth(userID),
      genSavingsRate(userID),
    ]);

    const userMetrics = await genUserMetrics(userID);
    let updatedMetrics: UserMetrics;

    if (userMetrics) {
      updatedMetrics = {
        ...Common.DBUtils.updateModelStub(userMetrics),
        netWorth,
        savingsRate,
      };
    } else {
      updatedMetrics = {
        ...Common.DBUtils.createModelStub('UserMetrics'),
        netWorth,
        savingsRate,
      };
    }

    batch.update(
      FirebaseAdmin.firestore()
        .collection('UserMetrics')
        .doc(updatedMetrics.id),
      updatedMetrics,
    );

    INFO('PLAID', 'Submitting batched update to firestore');
    await batch.commit();
  } catch (error) {
    ERROR(
      'PLAID',
      'Failed to download successfully, rolling back download status of credentials',
    );
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

async function genUserMetrics(userID: ID): Promise<?UserMetrics> {
  const document = await FirebaseAdmin.firestore()
    .collection('UserMetrics')
    .doc(userID)
    .get();

  if (!document.exists) {
    return null;
  }
  return document.data();
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
