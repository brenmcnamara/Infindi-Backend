/* @flow */

import FindiError from 'common/lib/FindiError';
import FirebaseAdmin from 'firebase-admin';
import UserInfo from 'common/lib/models/UserInfo';
import UserInfoMutator from 'common/lib/models/UserInfoMutator';
import YodleeCredentials from 'common/lib/models/YodleeCredentials';
import YodleeCredentialsFetcher from 'common/lib/models/YodleeCredentialsFetcher';
import YodleeCredentialsMutator from 'common/lib/models/YodleeCredentialsMutator';

import invariant from 'invariant';

import { ERROR, INFO } from '../../log-utils';
import { validateSignUpForm } from 'common/lib/models/Auth';

import type { ID } from 'common/types/core';
import type { ModelCollectionQuery } from 'common/lib/models/Model';
import type { SignUpForm } from 'common/lib/models/Auth';

const TEST_YODLEE_CREDENTIALS = [
  { loginName: 'sbMembrenmcnamara1', password: 'sbMembrenmcnamara1#123' },
  { loginName: 'sbMembrenmcnamara2', password: 'sbMembrenmcnamara2#123' },
  { loginName: 'sbMembrenmcnamara3', password: 'sbMembrenmcnamara3#123' },
  { loginName: 'sbMembrenmcnamara4', password: 'sbMembrenmcnamara4#123' },
  { loginName: 'sbMembrenmcnamara5', password: 'sbMembrenmcnamara5#123' },
];

/**
 * When this function is finished executing, a user will be created and
 * persisted in the datastore.
 */
async function genSignUpUserImpl(signUpForm: SignUpForm): Promise<UserInfo> {
  // TODO: This function assumed we are in sandbox mode and needs to be
  // rewritten once we are out of sandbox mode.

  INFO('USER-SIGNUP', 'Signing up new user');

  const signUpFormValidation = validateSignUpForm(signUpForm);
  if (signUpFormValidation.type === 'NOT_VALID') {
    throw signUpFormValidation.error;
  }

  // Figure out which test yodlee credentials are still available.
  // TODO: FIREBASE_DEPENDENCY
  // eslint-disable-next-line max-len
  const queryAllYodleeCredentials: ModelCollectionQuery =
    YodleeCredentials.FirebaseCollectionUNSAFE;
  const usedYodleeCredentials = await YodleeCredentialsFetcher.genCollectionQuery(
    queryAllYodleeCredentials,
  );

  const availableYodleeTestCredentials = TEST_YODLEE_CREDENTIALS.filter(
    raw =>
      !usedYodleeCredentials.some(creds => raw.loginName === creds.loginName),
  );

  if (availableYodleeTestCredentials.length === 0) {
    throw FindiError.fromRaw({
      errorCode: 'CORE / ASSERTION_FAILURE',
      errorMessage: 'No more yodlee credentials can be allocated',
    });
  }

  // NOTE: This will fail if the user already exists or the password is not
  // strong enough. Make sure NOT to perform any side effects before trying to
  // create the user on firebase, because if we persist anything for the new
  // user and creating the user fails, we will have a half-created user.
  // TODO: FIREBASE_DEPENDENCY
  const firebaseUser = await FirebaseAdmin.auth().createUser({
    email: signUpForm.email,
    emailVerified: true, // TODO: Should have some email verification.
    password: signUpForm.password,
    disabled: false,
  });

  invariant(
    firebaseUser,
    'Expecting creating user with firebase to result in new credentials containing a valid user',
  );
  const userID: ID = firebaseUser.uid;

  INFO('USER-SIGNUP', `Created firebase user with id: ${userID}`);

  const yodleeCredentials = YodleeCredentials.fromLoginNameAndPassword(
    userID,
    availableYodleeTestCredentials[0].loginName,
    availableYodleeTestCredentials[0].password,
  );
  await YodleeCredentialsMutator.genSet(yodleeCredentials);
  INFO('USER-SIGNUP', `userID=${userID} Created yodlee credentials`);

  const userInfo = UserInfo.fromSignUpForm(userID, signUpForm);
  await UserInfoMutator.genSet(userInfo);
  INFO('USER-SIGNUP', `userID=${userID} Created userInfo`);

  return userInfo;
}

async function genSignUpUser(signUpForm: SignUpForm): Promise<UserInfo> {
  try {
    const userInfo = await genSignUpUserImpl(signUpForm);
    return userInfo;
  } catch (error) {
    if (
      FindiError.isMaybeFirebaseError(error) &&
      error.code === 'auth/email-already-exists'
    ) {
      throw FindiError.fromRaw({
        errorCode: 'CORE / VALIDATION_ERROR',
        errorMessage: 'This email address already exists',
      });
    }

    const findiError = FindiError.fromUnknownEntity(error);
    ERROR('USER-SIGNUP', findiError.toString());
    throw findiError;
  }
}

export default genSignUpUser;
