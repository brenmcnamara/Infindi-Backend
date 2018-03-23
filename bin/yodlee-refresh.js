#!/usr/bin/env node

/* eslint-disable no-console */

require('./cli-setup');

const FirebaseAdmin = require('firebase-admin');
const YodleeClient = require('../build/YodleeClient').default;

const chalk = require('chalk');
const minimist = require('minimist');

const argv = minimist(process.argv.slice(2));
const providerAccountID = parseInt(argv['id'], 10);

let yodleeUserSession;

if (!providerAccountID) {
  console.log(chalk.red('You must provide argument --id=<userID>'));
  process.exit(1);
}

console.log(chalk.blue('Initializing yodlee client...'));
const yodleeClient = new YodleeClient();

// Authenticate Cobrand.
let promise = yodleeClient.genCobrandAuth(
  process.env.YODLEE_COBRAND_LOGIN,
  process.env.YODLEE_COBRAND_PASSWORD,
  process.env.YODLEE_COBRAND_LOCALE
);

// Find the provider account in the firestore db.
promise = promise.then(() => {
  console.log(chalk.blue('Fetching provider account from firestore'));
  return FirebaseAdmin.firestore()
    .collection('AccountLinks')
    .where('sourceOfTruth.type', '==', 'YODLEE')
    .where('sourceOfTruth.providerAccount.id', '==', providerAccountID)
    .get()
    .then(snapshot => {
      const doc = snapshot.docs[0];
      if (!doc || !doc.exists) {
        console.log(chalk.red(`Cannot find provider account with id ${providerAccountID}`));
        process.exit(1);
      }
      const accountLink = doc.data();
      const userID = accountLink.userRef.refID;
      return FirebaseAdmin.firestore().collection('YodleeCredentials').doc(userID).get();
    })
    .then(doc => {
      if (!doc || !doc.exists) {
        console.log(chalk.red(`Cannot find yodlee credentials for user`));
      }
      return doc.data();
    });
});

// Use the yodlee credentials of the user to login to yodlee. Save the yodlee user session
promise = promise.then(credentials => {
  return yodleeClient
    .genLoginUser(credentials.loginName, credentials.password)
    .then(_userSession => yodleeUserSession = _userSession);
});

// Refresh provider account.
promise = promise.then(() =>
  yodleeClient.genProviderAccountRefresh(yodleeUserSession, providerAccountID)
);

promise = promise.then(pa => console.log(pa.refreshInfo));

// Handle errors.
promise.catch(error => {
  console.log(chalk.red('ERROR!'));
  const description =
    error.errorMessage ||
    error.error_message ||
    error.message ||
    error.toString();
  console.log(chalk.red(description));
  process.exit(1);
});
