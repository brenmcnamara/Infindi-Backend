/* eslint-disable no-console */

require('./cli-setup');

const AccountLinkFetcher = require('common/lib/models/AccountLinkFetcher').default;
const AccountLinkQuery = require('common/lib/models/AccountLinkQuery').default;
const FirebaseAdmin = require('firebase-admin');
const FindiError = require('common/lib/FindiError').default;

const chalk = require('chalk');
const minimist = require('minimist');
const performDeleteLink = require('../build/operations/account-link/performDeleteLink').default;

const argv = minimist(process.argv.slice(2));
const userID = argv.userID;

// -----------------------------------------------------------------------------
//
// VALIDATE PARAMETERS
//
// -----------------------------------------------------------------------------

if (!userID) {
  console.log(chalk.red('You must provide argument --userID=<userID>'));
  process.exit(1);
}

// -----------------------------------------------------------------------------
//
// SCRIPT STARTS HERE
//
// -----------------------------------------------------------------------------

genValidateUserExists(userID)
  .then(() => AccountLinkFetcher.genCollectionQuery(
    AccountLinkQuery.Collection.forUser(userID))
  )
  .then(accountLinks => {
    accountLinks.forEach(accountLink => {
      performDeleteLink(accountLink.id);
    });
  })
  .catch(error => {
    const findiError = FindiError.fromUnknownEntity(error);
    console.log(chalk.red(findiError.toString()));
    process.exit(1);
  });

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function genValidateUserExists(userID) {
  return FirebaseAdmin.firestore()
    .collection('UserInfo')
    .doc(userID)
    .get()
    .then(doc => {
      if (!doc.exists) {
        console.log(chalk.red('No user found with id:', userID));
        process.exit(1);
      }
    });
}
