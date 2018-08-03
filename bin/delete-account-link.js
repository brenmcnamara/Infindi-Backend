/* eslint-disable no-console */

require('./cli-setup');

const AccountLinkOperations = require('../build/operations/account-link').default;

const chalk = require('chalk');
const minimist = require('minimist');

const argv = minimist(process.argv.slice(2));
const accountLinkID = argv.accountLinkID;

if (!accountLinkID) {
  console.log(chalk.red('You must provide argument --accountLinkID=<accountLinkID>'));
  process.exit(1);
}

AccountLinkOperations.performDeleteLink(accountLinkID);
