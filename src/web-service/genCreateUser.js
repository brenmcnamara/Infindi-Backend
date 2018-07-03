/* @flow */

import FirebaseAdmin from 'firebase-admin';
import UserInfo from 'common/lib/models/UserInfo';
import UserInfoMutator from 'common/lib/models/UserInfoMutator';

import { createPointer } from 'common/lib/db-utils';
import { ERROR } from '../log-utils';

import type { Pointer } from 'common/types/core';
import type { SignUpForm } from 'common/lib/models/Auth';

export default (async function genCreateUser(
  signUpForm: SignUpForm,
): Promise<Pointer<'User'>> {
  const user = await FirebaseAdmin.auth().createUser({
    disabled: false,
    // displayName: <Not storing here>
    email: signUpForm.email,
    emailVerified: false,
    password: signUpForm.password,
    // phoneNumber: ?
    // photoURL: ?
  });

  const now = new Date();
  const userInfo = UserInfo.fromRaw({
    createdAt: now,
    email: signUpForm.email,
    firstName: signUpForm.firstName,
    id: user.uid,
    isAdmin: false,
    isTestUser: signUpForm.isTestUser,
    lastName: signUpForm.lastName,
    modelType: 'UserInfo',
    type: 'MODEL',
    updatedAt: now,
  });

  try {
    await UserInfoMutator.genSet(userInfo);
  } catch (error) {
    ERROR('CREATE-USER', 'Created user but failed to create user info');
    throw error;
  }

  return createPointer('User', userInfo.id);
});
