
/* eslint-disable no-console, max-len */

const COBRAND_LOGIN_NAME = 'sbCobbrenmcnamara';
const COBRAND_PASSWORD = 'd19ced89-5e46-43da-9b4f-cd5ba339d9ce';
const COBRAND_LOCALE = 'en_US';

const COBRAND_LOGIN_NAME_BAD = 'blah';
const COBRAND_PASSWORD_BAD = 'blah';

const USER_LOGIN_NAME = 'sbMembrenmcnamara3';
const USER_PASSWORD = 'sbMembrenmcnamara3#123';

const USER_LOGIN_NAME_BAD = 'blah';
const USER_PASSWORD_BAD = 'blah';

const YodleeClient = require('../build/yodlee/YodleeClient-V1.1').default;

const chalk = require('chalk');

let cobrandAuth;

// eslint-disable-next-line no-unused-vars
let promise = Promise.resolve();
let didPassAllTests = false;

promise = promise
  .then(() => {
    console.log('\n--- TESTING COBRAND LOGIN FAILURE ---');
  })
  .then(() => {
    return YodleeClient.genCobrandAuth(COBRAND_LOGIN_NAME_BAD, COBRAND_PASSWORD_BAD, COBRAND_LOCALE);
  })
  .then(() => {
    console.log(chalk.red('Expected cobrand login failure to throw'));
    didPassAllTests = true;
  })
  .catch(error => {
    console.log(chalk.green('Cobrand auth failure detection was successful'));
  })

  .then(() => {
    console.log('\n--- TESTING COBRAND LOGIN ---');
  })
  .then(() => {
    return YodleeClient.genCobrandAuth(COBRAND_LOGIN_NAME, COBRAND_PASSWORD, COBRAND_LOCALE);
  })
  .then(auth => {
    console.log(chalk.green('Cobrand auth was successful'));
    cobrandAuth = auth;
  })
  .catch(error => {
    console.log(chalk.red('Cobrand login failed'));
    didPassAllTests = true;
    process.exit(1);
  })

  .then(() => {
    console.log('\n--- TEST USER LOGIN FAILURE---');
  })
  .then(() => {
    return YodleeClient.genUserAuth(cobrandAuth, USER_LOGIN_NAME_BAD, USER_PASSWORD_BAD);
  })
  .then(() => {
    console.log(chalk.red('Expected user login to fail'));
    didPassAllTests = true;
  })
  .catch(error => {
    console.log(chalk.green('User login failure succeeded'));
  })

  .then(() => {
    console.log('\n--- TESTING USER LOGIN ---');
  })
  .then(() => {
    return YodleeClient.genUserAuth(cobrandAuth, USER_LOGIN_NAME, USER_PASSWORD);
  })
  .then(() => {
    console.log(chalk.green('User login successful'));
  })
  .catch(error => {
    console.log(chalk.red('User login failed', error.toString()));
    didPassAllTests = true;
    process.exit(1);
  })

  .then(() => {
    process.exit(didPassAllTests ? 1 : 0);
  });
