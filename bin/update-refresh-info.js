#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * NOTE: This file is not transformed via babel. Must use
 * syntax this works with the runnning version of node.
 */

const Common = require('common');
const FirebaseAdmin = require('firebase-admin');
const YodleeClient = require('../build/YodleeClient').default;
const YodleeCredentials = require('common/lib/models/YodleeCredentials');
const YodleeOperations = require('../build/operations/yodlee');

const chalk = require('chalk');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Should eventually abstract this.
const USER_ID = 'q8L3tDxSSeOVNpPfdazpcCGW3PI2';
const COBRAND_LOGIN = 'sbCobbrenmcnamara';
const COBRAND_PASSWORD = 'd19ced89-5e46-43da-9b4f-cd5ba339d9ce';
const COBRAND_LOCALE = 'en_US';


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

const yodleeClient = new YodleeClient();

console.log(chalk.blue('Configuring yodlee'));

yodleeClient
  .genCobrandAuth(COBRAND_LOGIN, COBRAND_PASSWORD, COBRAND_LOCALE)
  .then(() => YodleeCredentials.genFetchYodleeCredentials(USER_ID))
  .then(creds => yodleeClient.genLoginUser(creds.loginName, creds.password))
  .then(userSession => YodleeOperations.genUpdateRefreshInfo(userSession, yodleeClient, USER_ID))
  .then(() => YodleeOperations.genCleanupRefreshInfo(USER_ID));
