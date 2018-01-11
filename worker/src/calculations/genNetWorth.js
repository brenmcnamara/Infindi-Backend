/* @flow */

import * as FirebaseAdmin from 'firebase-admin';

import type { Account } from 'common/lib/models/Account';
import type { Dollars, ID } from 'common/types/core';

async function genNetWorth(userID: ID): Promise<Dollars> {
  const Database = FirebaseAdmin.firestore();

  const snapshot = await Database.collection('Accounts')
    .where('userRef.refID', '==', userID)
    .get();

  const accounts: Array<Account> = snapshot.docs
    .filter(doc => doc.exists)
    .map(doc => doc.data());

  const balance = accounts.reduce((sum, account) => account.balance + sum, 0);
  return balance;
}

export default genNetWorth;
