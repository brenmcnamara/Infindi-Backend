/* @flow */

import genSignUpUser from '../operations/user/genSignUpUser';

import { createPointer } from 'common/lib/db-utils';

import type { Pointer } from 'common/types/core';
import type { SignUpForm } from 'common/lib/models/Auth';

async function genCreateUser(signUpForm: SignUpForm): Promise<Pointer<'User'>> {
  const userInfo = await genSignUpUser(signUpForm);
  return createPointer('User', userInfo.id);
}

export default genCreateUser;
