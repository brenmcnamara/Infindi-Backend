/* @flow */

import YodleeClient from './YodleeClient-V1.0';
import YodleeCredentialsFetcher from 'common/lib/models/YodleeCredentialsFetcher';

import invariant from 'invariant';

import {
  createSemaphore,
  wrapInSemaphoreRequest,
} from '../SingleThreadSemaphore';
import { DEBUG, INFO } from '../log-utils';

import type { ID } from 'common/types/core';
import type {
  Account as YodleeAccount,
  LoginForm,
  Provider,
  ProviderAccount,
  ProviderFull,
  Transaction as YodleeTransaction,
} from 'common/types/yodlee-v1.0';
import type { ProviderLoginResponse } from './YodleeClient-V1.0';

// Only 1 yodlee operation allowed at a time. Yodlee does not like concurrent
// requests.
const yodleeSemaphore = createSemaphore(1);

let yodleeClient: YodleeClient | null = null;
let genWaitForCobrandLogin: Promise<void> | null = null;
// Keep track of sessions that are being created at the moment.
const userToYodleeSessionGenerator: { [userID: ID]: Promise<any> } = {};
const userToYodleeSession: { [userID: ID]: string } = {};
// Keep track of when the sessions were created, for caching purposes.
const userToYodleeSessionMillis: { [userID: ID]: number } = {};

const USER_SESSION_REFRESH_CHECK_TIMEOUT = 5 * 60 * 1000;
const RETRY_COUNT = 1;
const RETRY_TIMEOUT = 500;

// -----------------------------------------------------------------------------
//
// EXPOSED OPERATIONS
//
// -----------------------------------------------------------------------------

function initialize(): void {
  const cobrandLogin = process.env.YODLEE_COBRAND_LOGIN;
  invariant(
    cobrandLogin,
    'Yodlee Cobrand Login not provided in the environment variables',
  );
  const cobrandPassword = process.env.YODLEE_COBRAND_PASSWORD;
  invariant(
    cobrandPassword,
    'Yodlee Cobrand Password not provided in the environment variables.',
  );
  const cobrandLocale = process.env.YODLEE_COBRAND_LOCALE;
  invariant(
    cobrandLocale === 'en_US',
    'Yodlee Cobrand Locale not provided in the environment variables.',
  );
  yodleeClient = new YodleeClient();
  INFO('YODLEE', 'Initializing cobrand auth');
  genWaitForCobrandLogin = yodleeClient.genCobrandAuth(
    cobrandLogin,
    cobrandPassword,
    cobrandLocale,
  );
}

// -----------------------------------------------------------------------------
//
// OVERRIDE YODLEE CLIENT METHODS
//
// -----------------------------------------------------------------------------

type GenProviders = (ID, number, number) => Promise<Array<Provider>>;
const genProviders: GenProviders = overrideClientAsyncMethod('genProviders');

type GenProviderFull = (ID, ID) => Promise<ProviderFull | null>;
const genProviderFull: GenProviderFull = overrideClientAsyncMethod(
  'genProviderFull',
);

type GenProviderLogin = (ID, ProviderFull) => Promise<ProviderLoginResponse>;
const genProviderLogin: GenProviderLogin = overrideClientAsyncMethod(
  'genProviderLogin',
);

type GenProviderAccounts = ID => Promise<Array<ProviderAccount>>;
const genProviderAccounts: GenProviderAccounts = overrideClientAsyncMethod(
  'genProviderAccounts',
);

type GenProviderAccount = (ID, ID) => Promise<ProviderAccount | null>;
const genProviderAccount: GenProviderAccount = overrideClientAsyncMethod(
  'genProviderAccount',
);

type GenAccountsForProviderAccount = (ID, ID) => Promise<Array<YodleeAccount>>;
// eslint-disable-next-line max-len
const genAccountsForProviderAccount: GenAccountsForProviderAccount = overrideClientAsyncMethod(
  'genAccountsForProviderAccount',
);

type GenDeleteProviderAccount = (ID, ID) => Promise<void>;
const genDeleteProviderAccount: GenDeleteProviderAccount = overrideClientAsyncMethod(
  'genDeleteProviderAccount',
);

type GenTransactions = (ID, ID) => Promise<Array<YodleeTransaction>>;
const genTransactions: GenTransactions = overrideClientAsyncMethod(
  'genTransactions',
);

type GenTransactionsFromDate = (
  ID,
  ID,
  Date,
) => Promise<Array<YodleeTransaction>>;
const genTransactionsFromDate: GenTransactionsFromDate = overrideClientAsyncMethod(
  'genTransactionsFromDate',
);

type GenProviderAccountRefresh = (ID, ID) => Promise<ProviderAccount | null>;
const genProviderAccountRefresh: GenProviderAccountRefresh = overrideClientAsyncMethod(
  'genProviderAccountRefresh',
);

type GenProviderAccountMFALogin = (ID, ID, LoginForm) => Promise<*>;
const genProviderAccountMFALogin: GenProviderAccountMFALogin = overrideClientAsyncMethod(
  'genProviderAccountMFALogin',
);

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function overrideClientAsyncMethod(methodName: string) {
  return async (userID: ID, ...args: Array<*>) => {
    await genCheckAndRefreshYodleeUserSession(userID);
    const userSession = getYodleeUserSession(userID);
    const client = getYodleeClient();
    // $FlowFixMe - This is hacky, deal with it, flow.
    const method = client[methodName];
    invariant(
      typeof method === 'function',
      'Expecting yodlee client to contain method: %s',
      method,
    );
    const allArgs = [userSession].concat(args);
    let result;
    let error;

    for (let i = 0; i < RETRY_COUNT + 1; ++i) {
      if (i > 0) {
        DEBUG('YODLEE', 'Retrying yodlee request');
      }
      try {
        result = await wrapInSemaphoreRequest(yodleeSemaphore, () =>
          method.apply(client, allArgs),
        );
        return result;
      } catch (_error) {
        const errorType =
          _error.type || _error.errorType || 'infindi/unknown_error';
        const errorMessage =
          _error.message ||
          _error.errorMessage ||
          _error.errorCode ||
          _error.toString();
        const toString = () => `[${errorType}]: ${errorMessage}`;
        DEBUG('YODLEE', `Caught yodlee error: ${toString()}`);
        error = { errorMessage, errorType, toString };
      }
      await genSleepForMS(RETRY_TIMEOUT);
    }
    throw error;
  };
}

// NOTE: This session may be expired. Make sure you know what you're doing.
function getYodleeUserSession(userID: ID): string {
  invariant(
    userToYodleeSession[userID],
    'No yodlee user session found for user %s',
    userID,
  );
  return userToYodleeSession[userID];
}

async function genCheckAndRefreshYodleeUserSession(userID: ID): Promise<void> {
  const credentials = await YodleeCredentialsFetcher.genNullthrows(userID);

  await genWaitForCobrandLogin;
  const yodleeClient = getYodleeClient();

  await (userToYodleeSessionGenerator[userID] || Promise.resolve());
  if (userToYodleeSession[userID]) {
    const session = userToYodleeSession[userID];
    const sessionCreatedAtMillis = userToYodleeSessionMillis[userID];
    invariant(
      sessionCreatedAtMillis,
      'Found a yodlee user session without a created date',
    );
    if (
      Date.now() - sessionCreatedAtMillis <
      USER_SESSION_REFRESH_CHECK_TIMEOUT
    ) {
      return;
    }

    const isActiveSession = await wrapInSemaphoreRequest(yodleeSemaphore, () =>
      yodleeClient.genIsActiveSession(session),
    );
    if (isActiveSession) {
      DEBUG('YODLEE', `Found valid yodlee session for user ${userID}`);
      return;
    }
    delete userToYodleeSession[userID];
    delete userToYodleeSessionMillis[userID];
  }

  DEBUG(
    'YODLEE',
    `No user session exists for user: ${userID}. Creating new session`,
  );

  // Block on session generator so we do not have multiple calls trying to login
  // with the same user.
  const sessionGenerator = wrapInSemaphoreRequest(yodleeSemaphore, () =>
    yodleeClient.genLoginUser(credentials.loginName, credentials.password),
  );
  userToYodleeSessionGenerator[userID] = sessionGenerator;
  const session = await sessionGenerator;
  delete userToYodleeSessionGenerator[userID];

  userToYodleeSession[userID] = session;
  userToYodleeSessionMillis[userID] = Date.now();
}

function getYodleeClient(): YodleeClient {
  invariant(
    yodleeClient,
    'Yodlee Manager must be initialized before being used',
  );
  return yodleeClient;
}

function genSleepForMS(millis: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, millis);
  });
}

export default {
  genAccountsForProviderAccount,
  genDeleteProviderAccount,
  genProviderAccount,
  genProviderAccountMFALogin,
  genProviderAccountRefresh,
  genProviderAccounts,
  genProviderFull,
  genProviderLogin,
  genProviders,
  genTransactions,
  genTransactionsFromDate,
  initialize,
};
