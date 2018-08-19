/* eslint-disable no-console */

require('./cli-setup');

const chalk = require('chalk');
const minimist = require('minimist');
const performDeleteUser = require('../build/operations/user/performDeleteUser').default;

const argv = minimist(process.argv.slice(2));
const userID = argv.userID;

if (!userID) {
  console.log(chalk.red('You must provide argument --userID=<userID>'));
  process.exit(1);
}

performDeleteUser(userID);
