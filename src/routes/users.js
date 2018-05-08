/* @flow */

import FirebaseAdmin from 'firebase-admin';

import express from 'express';

import { createPointer } from 'common/lib/db-utils';
import { ERROR } from '../log-utils';
import { genSetUserInfo } from 'common/lib/models/UserInfo';
import { handleError } from '../route-utils';

import type { RouteHandler } from '../middleware';
import type { SignUpForm } from 'common/lib/models/Auth';

const router = express.Router();
export default router;

export function initialize(): void {}

// -----------------------------------------------------------------------------
//
// POST /users
//
// -----------------------------------------------------------------------------

function validateCreateUser(): RouteHandler {
  return handleError((req, res, next) => {
    const { signUpForm } = req.body;
    // TODO: These checks are being done in the mobile app separately. Need
    // to unify these checks. Mobile app is more thorough and does some email
    // validation and password validation.
    if (
      typeof signUpForm.email !== 'string' ||
      typeof signUpForm.firstName !== 'string' ||
      typeof signUpForm.isTestUser !== 'boolean' ||
      typeof signUpForm.lastName !== 'string' ||
      typeof signUpForm.password !== 'string'
    ) {
      req.status(404).json({
        errorCode: 'infindi/bad-request',
        errorMessage: 'Invalid signUpForm',
      });
      return;
    }
    next();
  }, false);
}

function performCreateUser(): RouteHandler {
  return handleError(async (req, res) => {
    const signUpForm: SignUpForm = req.body.signUpForm;
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
    const userInfo = {
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
    };

    try {
      await genSetUserInfo(userInfo);
    } catch (error) {
      ERROR('CREATE-USER', 'Created user but failed to create user info');
      throw error;
    }

    res.json({ data: createPointer('UserInfo', userInfo.id) });
  }, true);
}

router.post('/', validateCreateUser());
router.post('/', performCreateUser());
