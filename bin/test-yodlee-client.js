/* eslint-disable no-console, max-len */

const YearMonthDay = require('common/lib/YearMonthDay').default;

const COBRAND_LOGIN_NAME = 'sbCobbrenmcnamara';
const COBRAND_PASSWORD = 'd19ced89-5e46-43da-9b4f-cd5ba339d9ce';
const COBRAND_LOCALE = 'en_US';

const COBRAND_LOGIN_NAME_BAD = 'blah';
const COBRAND_PASSWORD_BAD = 'blah';

const USER_LOGIN_NAME = 'sbMembrenmcnamara3';
const USER_PASSWORD = 'sbMembrenmcnamara3#123';

const USER_LOGIN_NAME_BAD = 'blah';
const USER_PASSWORD_BAD = 'blah';

const PROVIDER_NAN = 'NOT-A-NUMBER';
const PROVIDER_UNDEFINED = '11223344';
const PROVIDER_WELLS_FARGO = '5';

// TODO: Account id for fetching provider acccounts and for fetching
// transactions are not in sync.
const PROVIDER_ACCOUNT_ID = '10350735';
const PROVIDER_ACCOUNT_ID_FOR_TRANSACTIONS = '11427574';
const PROVIDER_ACCOUNT_ID_BAD = '12345';
const PROVIDER_ACCOUNT_ID_NAN = 'hello World';

const TRANSACTION_FETCH_MAX_LIMIT = 500;

const YodleeClient = require('../build/yodlee/YodleeClient-V1.1').default;

const chalk = require('chalk');
const invariant = require('invariant');

let cobrandAuth;
let userAuth;

// eslint-disable-next-line no-unused-vars
let promise = Promise.resolve();
let didPassAllTests = true;

promise = promise
  .then(() => {
    console.log('\n--- TESTING COBRAND LOGIN FAILURE ---');
  })
  .then(() => {
    return YodleeClient.genCobrandAuth(
      COBRAND_LOGIN_NAME_BAD,
      COBRAND_PASSWORD_BAD,
      COBRAND_LOCALE,
    );
  })
  .then(() => {
    console.log(chalk.red('Expected cobrand login failure to throw'));
    didPassAllTests = false;
  })
  .catch(error => {
    console.log(chalk.green('Cobrand auth failure detection was successful'));
  })

  .then(() => {
    console.log('\n--- TESTING COBRAND LOGIN ---');
  })
  .then(() => {
    return YodleeClient.genCobrandAuth(
      COBRAND_LOGIN_NAME,
      COBRAND_PASSWORD,
      COBRAND_LOCALE,
    );
  })
  .then(auth => {
    console.log(chalk.green('Cobrand auth was successful'));
    cobrandAuth = auth;
  })
  .catch(error => {
    console.log(chalk.red('Cobrand login failed'));
    didPassAllTests = false;
    process.exit(1);
  })

  .then(() => {
    console.log('\n--- TEST USER LOGIN FAILURE---');
  })
  .then(() => {
    return YodleeClient.genUserAuth(
      cobrandAuth,
      USER_LOGIN_NAME_BAD,
      USER_PASSWORD_BAD,
    );
  })
  .then(auth => {
    console.log(chalk.red('Expected user login to fail'));
    didPassAllTests = false;
  })
  .catch(error => {
    console.log(chalk.green('User login failure succeeded'));
  })

  .then(() => {
    console.log('\n--- TESTING USER LOGIN ---');
  })
  .then(() => {
    return YodleeClient.genUserAuth(
      cobrandAuth,
      USER_LOGIN_NAME,
      USER_PASSWORD,
    );
  })
  .then(auth => {
    console.log(chalk.green('User login successful'));
    userAuth = auth;
  })
  .catch(error => {
    console.log(chalk.red('User login failed', error.toString()));
    didPassAllTests = false;
    process.exit(1);
  })

  .then(() => {
    console.log('\n ---TEST FETCH PROVIDER ---');
    return YodleeClient.genFetchProvider(cobrandAuth, PROVIDER_WELLS_FARGO);
  })
  .then(provider => {
    invariant(
      provider,
      'Expecting provider with id %s to exist',
      PROVIDER_WELLS_FARGO,
    );
    console.log(chalk.green('Provider found!'));
  })
  .catch(error => {
    console.log(chalk.red(`Fetching provider threw error: ${error}`));
    didPassAllTests = false;
  })

  .then(() => {
    console.log('\n ---TEST FETCH UNDEFINED PROVIDER ---');
    return YodleeClient.genFetchProvider(cobrandAuth, PROVIDER_UNDEFINED);
  })
  .then(provider => {
    invariant(
      !provider,
      'Expecting no provider to exist with id %s',
      PROVIDER_UNDEFINED,
    );
    console.log(chalk.green('Success!'));
  })
  .catch(error => {
    console.log(chalk.red(error.toString()));
    didPassAllTests = false;
  })

  .then(() => {
    console.log('\n--- TEST FETCH NAN PROVIDER ---');
    return YodleeClient.genFetchProvider(cobrandAuth, PROVIDER_NAN);
  })
  .then(provider => {
    invariant(!provider, 'Expecting provider to not exist');
    console.log(chalk.green('Success!'));
  })

  .then(() => {
    console.log('\n--- TEST FETCH PROVIDERS ---');
    const limit = 10;
    const offset = 0;
    return YodleeClient.genFetchProviders(cobrandAuth, limit, offset);
  })
  .then(providers => {
    invariant(
      providers.size === 10,
      'Expecting genFetchProviders to fetch 10 providers. Only fetched %s',
      providers.size,
    );
    console.log(chalk.green('genFetchProviders success'));
  })
  .catch(error => {
    console.log(chalk.red('genFetchProviders failed', error.toString()));
    didPassAllTests = false;
  })

  .then(() => {
    console.log('\n--- TEST FETCH PROVIDERS WITH INVALID LIMIT ---');
    const limit = 501;
    const offset = 0;
    return YodleeClient.genFetchProviders(cobrandAuth, limit, offset);
  })
  .then(() => {
    console.log(
      chalk.red('Expected genFetchProviders with invalid limit to fail'),
    );
    didPassAllTests = false;
  })
  .catch(error => {
    if (error.errorCode === 'Y804') {
      console.log(
        chalk.green('Successfully caught bad parameter for fetching providers'),
      );
    } else {
      console.log(chalk.red(`Through unrecognized error: ${error.toString()}`));
      didPassAllTests = false;
    }
  })

  .then(() => {
    console.log('\n--- FETCH PROVIDER ACCOUNT ---');
    return YodleeClient.genFetchProviderAccount(userAuth, PROVIDER_ACCOUNT_ID);
  })
  .then(providerAccount => {
    invariant(providerAccount, 'Expecting provider account to exist');
    console.log(chalk.green('Success!'));
  })
  .catch(error => {
    console.log(chalk.red(error.toString()));
    didPassAllTests = false;
  })

  .then(() => {
    console.log('\n--- FETCH PROVIDER ACCOUNT NULL ---');
    return YodleeClient.genFetchProviderAccount(
      userAuth,
      PROVIDER_ACCOUNT_ID_BAD,
    );
  })
  .then(providerAccount => {
    invariant(
      providerAccount === null,
      'Expecting provider account to be null',
    );
    console.log(chalk.green('Success!'));
    didPassAllTests = false;
  })
  .catch(error => {
    console.log(chalk.red(error.toString()));
    didPassAllTests = false;
  })

  .then(() => {
    console.log('\n--- FETCH PROVIDER ACCOUNT NAN ---');
    return YodleeClient.genFetchProviderAccount(
      userAuth,
      PROVIDER_ACCOUNT_ID_NAN,
    );
  })
  .then(providerAccount => {
    invariant(
      providerAccount === null,
      'Expecting provider account to be null',
    );
    console.log(chalk.green('Success!'));
  })
  .catch(error => {
    console.log(chalk.red(JSON.stringify(error)));
    didPassAllTests = false;
  })

  .then(() => {
    console.log('\n--- FETCH PROVIDER ACCOUNTS ---');
    return YodleeClient.genFetchProviderAccounts(userAuth);
  })
  .then(providerAccounts => {
    invariant(providerAccounts.length > 0, 'Expecting user to have accounts');
    console.log(chalk.green('Success!'));
  })
  .catch(error => {
    console.log(chalk.red(JSON.stringify(error)));
    didPassAllTests = false;
  })

  // TODO: Add a test for a user with an empty set of provider accounts. Need
  // to make sure that it returns an empty array. For this to work, we need
  // to have a temp user that never links with any accounts.

  .then(() => {
    console.log('\n--- FETCH TRANSACTIONS BY PROVIDER ACCOUNT ---');
    return YodleeClient.genFetchTransactions(
      userAuth,
      PROVIDER_ACCOUNT_ID_FOR_TRANSACTIONS,
    );
  })
  .then(transactions => {
    invariant(
      transactions.length > 0,
      'Expecting transactions to be fetched by provider account id',
    );
    console.log(chalk.green('Success!'));
  })
  .catch(error => {
    console.log(chalk.red(JSON.stringify(error)));
    didPassAllTests = false;
  })

  .then(() => {
    console.log('\n --- FETCH TRANSACTION WITH EXPLICIT LIMIT ---');
    const query = { limit: 2 };
    return YodleeClient.genFetchTransactions(
      userAuth,
      PROVIDER_ACCOUNT_ID_FOR_TRANSACTIONS,
      query,
    );
  })
  .then(transactions => {
    invariant(transactions.length === 2, 'Expecting to fetch 10 transactions');
    console.log(chalk.green('Success!'));
  })
  .catch(error => {
    console.log(chalk.red(JSON.stringify(error)));
    didPassAllTests = false;
  })

  .then(() => {
    console.log(
      '\n --- FETCH TRANSACTIONS BY PROVIDER ACCOUNT AND START DATE ---',
    );
    const AUGUST_1_2018 = YearMonthDay.create(2018, 7, 1);
    const query = {
      offset: 0,
      limit: 2,
      startDate: AUGUST_1_2018,
    };
    return YodleeClient.genFetchTransactions(
      userAuth,
      PROVIDER_ACCOUNT_ID_FOR_TRANSACTIONS,
      query,
    );
  })
  .then(transactions => {
    // TODO: Need to be a proper date check to make sure all the transactions
    // fetched are after a certain date.
    invariant(transactions.length === 2, 'Transactions fetchded are incorrect');
    console.log(chalk.green('Success!'));
  })
  .catch(error => {
    console.log(chalk.red(JSON.stringify(error)));
    didPassAllTests = false;
  })

  .then(() => {
    console.log('\n--- FETCH TOO MANY TRANSACTIONS AT ONCE ---');
    const query = { limit: TRANSACTION_FETCH_MAX_LIMIT + 1 };
    return YodleeClient.genFetchTransactions(
      userAuth,
      PROVIDER_ACCOUNT_ID_FOR_TRANSACTIONS,
      query,
    );
  })
  .then(() => {
    console.log(chalk.red('Expecting fetch to fail due to exceeded limit'));
    didPassAllTests = false;
  })
  .catch(error => {
    // TODO: Need to validate that this is the correct error.
    console.log(chalk.green('Success!'));
  })

  .then(() => {
    console.log('\n--- FETCH TRANSACTIONS WITH NEGATIVE OFFSET ---');
    const query = { limit: 20, offset: -1 };
    return YodleeClient.genFetchTransactions(
      userAuth,
      PROVIDER_ACCOUNT_ID_FOR_TRANSACTIONS,
      query,
    );
  })
  .then(() => {
    console.log(chalk.red('Expecting fetch to fail due to negative offset'));
    didPassAllTests = false;
  })
  .catch(error => {
    // TODO: Need to validate that this is the correct error.
    console.log(chalk.green('Success!'));
  })

  .then(() => {
    process.exit(didPassAllTests ? 0 : 1);
  });
