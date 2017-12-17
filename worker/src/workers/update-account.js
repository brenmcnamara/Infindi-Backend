/* @flow */

import * as FirebaseAdmin from 'firebase-admin';
import CommonBackend from 'common-backend';

import getAccountFromPlaidAccount from '../calculations/getAccountFromPlaidAccount';
import invariant from 'invariant';

import { INFO } from '../log-utils';

import type { Account, PlaidCredentials } from 'common/src/types/db';
import type { ID } from 'common/src/types/core';

const { Job } = CommonBackend;

export function initialize(workerID: ID): void {
  INFO('INITIALIZATION', 'Initializing update-account worker');
  Job.listenToJobRequest('UPDATE_ACCOUNT', workerID, genUpdateAccount);
}

async function genUpdateAccount(payload: Object) {
  const Database = FirebaseAdmin.firestore();
  const accountID: ID = payload.accountID;
  const prevAccount = await genAccount(accountID);

  if (!prevAccount || prevAccount.sourceOfTruth.type !== 'PLAID') {
    return;
  }

  const plaidAccount = prevAccount.sourceOfTruth.value;
  const credentialsID = prevAccount.credentialsRef.refID;
  const credentials = await genCredentials(credentialsID);
  invariant(
    credentials,
    'Found Plaid Account with missing user credentials: %s',
    credentialsID,
  );
  let newAccount = getAccountFromPlaidAccount(plaidAccount, credentials);
  // Revert some properties on the new document for correctness.
  newAccount = {
    ...newAccount,
    id: prevAccount.id,
    updatedAt: prevAccount.updatedAt,
  };

  await Database.collection('Accounts')
    .doc(accountID)
    .set(newAccount);
}

async function genAccount(accountID: ID): Promise<?Account> {
  const Database = FirebaseAdmin.firestore();
  const document = await Database.collection('Accounts')
    .doc(accountID)
    .get();
  return document.exists ? document.data() : null;
}

async function genCredentials(userID: ID): Promise<?PlaidCredentials> {
  const Database = FirebaseAdmin.firestore();
  const document = await Database.collection('PlaidCredentials')
    .doc(userID)
    .get();
  return document.exists ? document.data() : null;
}
