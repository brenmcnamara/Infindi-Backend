
/* eslint-disable no-console */

const COBRAND_LOGIN_NAME = 'sbCobbrenmcnamara'
const COBRAND_PASSWORD = 'd19ced89-5e46-43da-9b4f-cd5ba339d9ce';
const COBRAND_LOCALE = 'en_US';

const YodleeClient = require('../build/yodlee/YodleeClient-V1.1').default;

const chalk = require('chalk');


// eslint-disable-next-line no-unused-vars
let promise = Promise.resolve();

promise = promise
  .then(() => {
    console.log(chalk.blue('\n--- TESTING COBRAND LOGIN ---\n'));
  })
  .then(() => {
    return YodleeClient.genCobrandAuth(COBRAND_LOGIN_NAME, COBRAND_PASSWORD, COBRAND_LOCALE);
  })
  .then(auth => {
    console.log(chalk.green('Cobrand auth was successful'));
  })
  .catch(error => {
    console.log(chalk.red('Cobrand login failed'));
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });
