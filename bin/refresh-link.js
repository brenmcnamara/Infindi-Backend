#!/usr/bin/env node

/* eslint-disable no-console */

require('./cli-setup');

const AccountLinkFetcher = require('common/lib/models/AccountLinkFetcher').default;
const AccountLinkRefreshOperations = require('../build/operations/account-link/refresh');

const chalk = require('chalk');
const invariant = require('invariant');
const minimist = require('minimist');

const argv = minimist(process.argv.slice(2));
const accountLinkID = argv.id;
const force = argv.force;

if (!accountLinkID) {
  console.log(chalk.red('You must provide argument --id=<accountLinkID>'));
  process.exit(1);
}

AccountLinkFetcher.gen(accountLinkID)
  .then(accountLink => {
    invariant(
      accountLink,
      'Cannot find account link with id: %s',
      accountLink.id,
    );
    return AccountLinkRefreshOperations.genYodleeRefreshAccountLink(
      accountLink,
      force === 'true',
    );
  })
  .then(() => {
    console.log(chalk.green('Refresh complete!'));
    process.exit(0);
  })
  .catch(error => {
    const errorMessage =
      error.errorMessage ||
      error.error_message ||
      error.message ||
      error.toString();
    console.log(chalk.red(errorMessage));
    process.exit(1);
  });
