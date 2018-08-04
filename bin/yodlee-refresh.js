#!/usr/bin/env node

/* eslint-disable no-console */

require('./cli-setup');

const AccountLinkFetcher = require('common/lib/models/AccountLinkFetcher').default;
const RefreshOperations = require('../build/operations/account-link/refresh');

const chalk = require('chalk');
const invariant = require('invariant');
const minimist = require('minimist');

const argv = minimist(process.argv.slice(2));
const accountLinkID = argv['id'];

if (!accountLinkID) {
  console.log(chalk.red('You must provide the argument: --id=<accountLinkID>'));
  process.exit(1);
}

console.log(chalk.blue('Initializing yodlee client...'));

// Find the provider account in the firestore db.
AccountLinkFetcher.gen(accountLinkID)
  .then(accountLink => {
    invariant(accountLink, 'No account link found with id: %s', accountLinkID);
    return RefreshOperations.genYodleeRefreshAccountLink(accountLink, true);
  })
  .then(() => {
    console.log(chalk.green('Finished refresh!'));
    process.exit(0);
  })
  .catch(error => {
    console.log(chalk.red('ERROR!'));
    const description =
      error.errorMessage ||
      error.error_message ||
      error.message ||
      error.toString();
    console.log(chalk.red(description));
    process.exit(1);
  });
