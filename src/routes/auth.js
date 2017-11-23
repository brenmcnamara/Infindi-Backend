/* @flow */

import * as Firebase from 'firebase';
import * as FirebaseAdmin from 'firebase-admin';

import { type Firebase$User } from '../types/firebase';
import {
  type LoginCredentials,
  type LoginPayload,
  type UserInfo,
} from '../types/db';

import express from 'express';

type RouteHandler = (req: any, res: any, next: Function) => any;

const router = express.Router();

// -----------------------------------------------------------------------------
//
// GET /me
//
// -----------------------------------------------------------------------------

router.get('/me', async (req, res) => {
  // TODO: Implememtn me!
  res.send('IMPLEMENT ME!!');
});

// -----------------------------------------------------------------------------
//
// POST /login
//
// -----------------------------------------------------------------------------

export type LoginRequestBody = {|
  +credentials: LoginCredentials,
|};

export type LoginResponseBody = {|
  +loginPayload: LoginPayload,
|};

// TODO: Look at possible error codes from firebase.
export type LoginErrorCode =
  | 'infindi/server-error'
  | 'infindi/bad-request'
  | 'auth/argument-error'
  | string;

function validateLogin(): RouteHandler {
  return (req, res, next) => {
    const { credentials } = req.body;
    if (!credentials) {
      res.status(400).json({
        errorCode: 'infindi/bad-request',
        errorMessage: 'Request must contain login credentials',
      });
    } else if (
      typeof credentials.email !== 'string' ||
      typeof credentials.password !== 'string'
    ) {
      res.status(400).json({
        errorCode: 'infindi/bad-request',
        errorMessage:
          'Request credentials must contain valid email and password',
      });
    } else {
      next();
    }
  };
}

function performLogin(): RouteHandler {
  return async (req, res) => {
    const credentials: LoginCredentials = req.body.credentials;
    try {
      const loginPayload = await genFirebaseLogin(credentials);
      res.json({ data: loginPayload });
    } catch (error) {
      // TODO: Differentiate between status codes for different types of errors.
      const errorCode = error.code || 'infindi/server-error';
      const status: number = getStatusForErrorCode(errorCode);
      res.status(status).json({
        errorCode: error.code || 'infindi/server-error',
        errorMessage: error.toString(),
      });
    }
  };
}

router.post('/login', validateLogin());
router.post('/login', performLogin());

export default router;

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

async function genFirebaseLogin(credentials: LoginCredentials) {
  const AdminAuth = FirebaseAdmin.auth();
  const Auth = Firebase.auth();
  const Database = Firebase.database();
  const { email, password } = credentials;
  const firebaseUser: Firebase$User = await Auth.signInWithEmailAndPassword(
    email,
    password,
  );
  const { uid } = firebaseUser;
  const path = `UserInfo/${uid}`;
  const userInfo: UserInfo = await Database.ref(path).once('value');
  // TODO: Create auth token using firebase admin.
  // TODO: Figure out the error codes that can happen for this.
  // https://firebase.google.com/docs/auth/admin/errors
  const accessToken = await AdminAuth.createCustomToken(uid);
  return { accessToken, firebaseUser, userInfo };
}

// TODO: Add more error codes here and indicate where they may be coming
// from.

const ERROR_CODE_400 = ['auth/invalid-email'];

const ERROR_CODE_401 = [
  // https://rnfirebase.io/docs/v3.1.*/auth/reference/auth#signInWithEmailAndPassword
  'auth/wrong-password',
  'auth/user-not-found',
  'auth/user-disabled',
  'auth/disabled',

  // https://firebase.google.com/docs/auth/admin/errors
  'auth/invalid-credential',
  'auth/insufficient-permission',
];

function getStatusForErrorCode(code: string): number {
  if (ERROR_CODE_400.includes(code)) {
    return 400;
  } else if (ERROR_CODE_401.includes(code)) {
    return 401;
  }
  return 500;
}
