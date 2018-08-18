/* @flow */

import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkQuery from 'common/lib/models/AccountLinkQuery';
import FindiError from 'common/lib/FindiError';
import FirebaseAdmin from 'firebase-admin';
import UserInfoMutator from 'common/lib/models/UserInfoMutator';
import YodleeCredentialsMutator from 'common/lib/models/YodleeCredentialsMutator';

import performDeleteLink from '../account-link/performDeleteLink';

import { ERROR, INFO } from '../../log-utils';

import type { ID } from 'common/types/core';

// TODO: This function is unsafe since we can fail deleting the user links and
// end up with a lot of user data undeleted, even when the user is deleted.
// Need to create some way of subscribing to long-running tasks.

async function genPerformDeleteUserImpl(userID: ID) {
  const accountLinkQuery = AccountLinkQuery.Collection.forUser(userID);
  const accountLinks = await AccountLinkFetcher.genCollectionQuery(
    accountLinkQuery,
  );

  INFO(
    'DELETE-USER',
    `userID=${userID} Deleting ${accountLinks.size} provider link(s) for user`,
  );

  accountLinks.forEach(accountLink => {
    performDeleteLink(accountLink.id);
  });

  INFO('DELETE-USER', `userID=${userID} Deleting userInfo`);
  await UserInfoMutator.genDelete(userID);

  INFO('DELETE-USER', `userID=${userID} Deleting yodlee credentials`);
  await YodleeCredentialsMutator.genDelete(userID);

  INFO('DELETE-USER', `userID=${userID} Deleting firebase user`);
  // TODO: FIREBASE_DEPENDENCY
  await FirebaseAdmin.auth().deleteUser(userID);
}

/**
 * Delete a user, and all data associated with that user, including provider
 * links, accounts, transactions, and third-party credentials.
 */
function performDeleteUser(userID: ID) {
  try {
    genPerformDeleteUserImpl(userID);
  } catch (error) {
    const findiError = FindiError.fromUnknownEntity(error);
    ERROR('DELETE-USER', `userID=${userID} ${findiError.toString()}`);
  }
}

export default performDeleteUser;
