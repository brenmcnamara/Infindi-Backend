/* @flow */

// import * as FirebaseAdmin from 'firebase-admin';
// import Common from 'common';
// import CommonBackend from 'common-backend';
import YodleeClient from '../YodleeClient';

import express from 'express';
import invariant from 'invariant';

// import { checkAuth } from '../middleware';
// import { DEBUG, ERROR, INFO } from '../log-utils';

// import type { ID } from 'common/types/core';
import type { RouteHandler } from '../middleware';

const router = express.Router();

export default router;

// TODO: Move these to environment variables.

const COBRAND_LOGIN = 'sbCobbrenmcnamara';
const COBRAND_PASSWORD = 'd19ced89-5e46-43da-9b4f-cd5ba339d9ce';
const COBRAND_LOCALE = 'en_US';
const LOGIN_NAME = 'sbMembrenmcnamara1';
const LOGIN_PASSWORD = 'sbMembrenmcnamara1#123';

let yodleeClient: YodleeClient | null = null;

export function initialize(): void {
  yodleeClient = new YodleeClient();
}

// -----------------------------------------------------------------------------
//
// GET test
//
// -----------------------------------------------------------------------------

function performTest(): RouteHandler {
  return (req, res) => {
    const client = getYodleeClient();
    client
      .genCobrandAuth(COBRAND_LOGIN, COBRAND_PASSWORD, COBRAND_LOCALE)
      .then(() => {
        console.log('cobrand logged in...');
        return client.genLoginUser(LOGIN_NAME, LOGIN_PASSWORD);
      })
      .then(() => {
        console.log('user logged in...');
        return client.genProviderAccounts();
      })
      .then(accounts => {
        console.log(accounts);
        res.json({ data: accounts });
      })
      .catch(error => {
        console.log(error.toString());
        res.status(500).send(error);
      });
  };
}

router.get('/test', performTest());

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function getYodleeClient(): YodleeClient {
  invariant(
    yodleeClient,
    'Trying to access yodlee client before routes have been initialized',
  );
  return yodleeClient;
}
