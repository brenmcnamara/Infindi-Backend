#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * NOTE: This file is not transformed via babel. Must use
 * syntax this works with the runnning version of node.
 */

const Common = require('common');
const FirebaseAdmin = require('firebase-admin');
const YodleeClient = require('../build/YodleeClient').default;
const YodleeProvider = require('common/lib/models/YodleeProvider');

const chalk = require('chalk');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const COBRAND_LOGIN = 'sbCobbrenmcnamara';
const COBRAND_PASSWORD = 'd19ced89-5e46-43da-9b4f-cd5ba339d9ce';
const COBRAND_LOCALE = 'en_US';
const LOGIN_NAME = 'sbMembrenmcnamara1';
const LOGIN_PASSWORD = 'sbMembrenmcnamara1#123';
const PROVIDER_FETCH_LIMIT = Infinity;

console.log('Configuring environment variables...');
dotenv.config();

console.log('Configuring Firebase Admin...');
const serviceCertFilename = path.join(
  __dirname,
  '../firebase-service-cert.json'
);
const serviceCertSerialized = fs.readFileSync(serviceCertFilename).toString();
const serviceCert = JSON.parse(serviceCertSerialized);

FirebaseAdmin.initializeApp({
  credential: FirebaseAdmin.credential.cert(serviceCert),
  databaseURL: process.env.FIREBASE_DB_URL,
});

Common.initializeAsAdmin(FirebaseAdmin);

console.log(chalk.blue('Authenticating with yodlee...'));
const yodlee = new YodleeClient();

Promise.resolve()
  .then(() => yodlee.genCobrandAuth(COBRAND_LOGIN, COBRAND_PASSWORD, COBRAND_LOCALE))
  .then(() => console.log(chalk.blue('Logged in with cobrand...')))
  .then(() => yodlee.genLoginUser(LOGIN_NAME, LOGIN_PASSWORD))
  .then(() => console.log(chalk.blue('Logged in user...')))
  .then(() => console.log(chalk.blue('Fetching providers. This can take a few minutes...')))
  .then(() => fetchAndSyncProviders(0))
  .then(() => {
    console.log(chalk.green('Done updating!'));
    process.exit(0);
  })
  .catch(error => {
    console.log(chalk.red('Update failed: ', error.errorMessage || error.toString()));
    process.exit(1);
  });

function fetchAndSyncProviders(offset) {
  return yodlee.genProviders(offset, 500)
    .then(rawProviders => {
      const providers = rawProviders.map(raw => YodleeProvider.createProvider(raw));
      console.log(offset, rawProviders.length);
      const shouldFetchMore =
        providers.length === 500 &&
        offset + providers.length < PROVIDER_FETCH_LIMIT;
      return YodleeProvider.genUpsertProviders(providers).then(() => shouldFetchMore);
    })
    .then(shouldFetchMore => {
      if (shouldFetchMore) {
        return fetchAndSyncProviders(offset + 500);
      }
    });
}
