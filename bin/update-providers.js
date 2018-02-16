#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * NOTE: This file is not transformed via babel. Must use
 * syntax this works with the runnning version of node.
 */

const Common = require('common');
const FirebaseAdmin = require('firebase-admin');
const YodleeClient = require('../build/YodleeClient').default;
const Provider = require('common/lib/models/Provider');

const chalk = require('chalk');
const dotenv = require('dotenv');
const fs = require('fs');
const invariant = require('invariant');
const path = require('path');
const uuid = require('uuid/v4');

const COBRAND_LOGIN = 'sbCobbrenmcnamara';
const COBRAND_PASSWORD = 'd19ced89-5e46-43da-9b4f-cd5ba339d9ce';
const COBRAND_LOCALE = 'en_US';
const LOGIN_NAME = 'sbMembrenmcnamara1';
const LOGIN_PASSWORD = 'sbMembrenmcnamara1#123';
const PROVIDER_FETCH_LIMIT = Infinity;
const PROVIDER_FETCH_PAGING = 500;

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

let yodleeUserSession = null;

Promise.resolve()
  .then(() => yodlee.genCobrandAuth(COBRAND_LOGIN, COBRAND_PASSWORD, COBRAND_LOCALE))
  .then(() => console.log(chalk.blue('Logged in with cobrand...')))
  .then(() => yodlee.genLoginUser(LOGIN_NAME, LOGIN_PASSWORD))
  .then(_session => yodleeUserSession = _session)
  .then(() => console.log(chalk.blue('Logged in user...')))
  .then(() => console.log(chalk.blue('Fetching providers. This can take a few minutes...')))
  .then(() => fetchAndSyncProviders(7000))
  .then(() => {
    console.log(chalk.green('Done updating!'));
    process.exit(0);
  })
  .catch(error => {
    console.log(chalk.red('Update failed: ', error.errorMessage || error.toString()));
    process.exit(1);
  });

function fetchAndSyncProviders(offset) {
  const limit = Math.min(PROVIDER_FETCH_PAGING, PROVIDER_FETCH_LIMIT - offset);
  return yodlee.genProviders(yodleeUserSession, offset, limit)
    .then(rawProviders => {
      console.log(offset, rawProviders.length);
      const shouldFetchMore =
        rawProviders.length === PROVIDER_FETCH_PAGING &&
        offset + rawProviders.length < PROVIDER_FETCH_LIMIT;
      const fetchFull = Promise.all(rawProviders.map(p => fetchFullProvider(p)));
      return fetchFull
        .then(fullProviders => {
          const providers = fullProviders.map(yodleeProvider => {
            const sourceOfTruth = {type: 'YODLEE', value: yodleeProvider};
            const quirks = getProviderQuirks(yodleeProvider);
            return Provider.createProvider(sourceOfTruth, quirks);
          });
          return Provider.genUpsertProviders(providers);
        })
        .then(() => shouldFetchMore);
    })
    .then(shouldFetchMore => {
      if (shouldFetchMore) {
        return fetchAndSyncProviders(offset + PROVIDER_FETCH_PAGING);
      }
    });
}

function fetchFullProvider(provider) {
  let requestID = null;
  return requestSemaphore()
    .then((_requestID) => {
      requestID = _requestID;
      return yodlee.genProviderFull(yodleeUserSession, provider.id);
    })
    .catch(error => {
      console.log(`Failed on provider ${provider.id}: ${error.toString()}`);
      return null;
    })
    .then(provider => {
      releaseSemaphore(requestID);
      invariant(provider, 'No Provider');
      return provider;
    });
}

// Assuming requests for semaphore are all on the same thread. Node makes things
// easy :)
const MAX_AVAILABLE_SEMAPHORES = 1;
let pendingRequestPayloads = [];
let runningRequests = [];

let count = 0;

function requestSemaphore() {
  const requestID = uuid();
  if (runningRequests.length < MAX_AVAILABLE_SEMAPHORES) {
    runningRequests.push(requestID);
    console.log('Count:', ++count);
    return Promise.resolve(requestID);
  }
  return new Promise(resolve => {
    pendingRequestPayloads.push({requestID, resolve});
  });
}

function releaseSemaphore(requestID) {
  const index = runningRequests.indexOf(requestID);
  invariant(index >= 0, 'Trying to release semaphore that is not posessed');
  const payload = pendingRequestPayloads.shift();
  runningRequests.splice(index, 1);
  if (payload) {
    runningRequests.push(payload.requestID);
    console.log('Count:', ++count);
    payload.resolve(payload.requestID);
  }
  return Promise.resolve();
}

function getProviderQuirks(yodleeProvider) {
  if (!yodleeProvider.loginForm) {
    return ['NO_LOGIN_FORM'];
  }

  const {loginForm} = yodleeProvider;

  if (!loginForm.row || loginForm.row.length === 0) {
    return ['EMPTY_LOGIN_FORM'];
  }

  const quirks = [];

  const rows = loginForm.row;
  const fieldCounts = rows.map(entry => entry.field ? entry.field.length : 0);
  if (fieldCounts.some(count => count > 1)) {
    quirks.push('ROW_CONTAINS_MULTIPLE_FIELDS');
  }

  if (fieldCounts.some(count => count === 0)) {
    quirks.push('ROW_CONTAINS_NO_FIELDS');
  }

  const allFields = rows.reduce(
    (memo, entry) => entry.field ? memo.concat(entry.field) : memo,
    [],
  );

  const TEXT_FIELD_TYPES = ['text', 'password'];
  if (allFields.some(field => !TEXT_FIELD_TYPES.includes(field.type))) {
    quirks.push('ROW_CONTAINS_NON_TEXT_FIELD');
  }

  return quirks;
}
