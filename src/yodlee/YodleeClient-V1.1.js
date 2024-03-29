/* @flow */

/**
 * This module is a client-side abstraction to the Yodlee API. Docs can be
 * viewed here: https://developer.yodlee.com/apidocs/index.php
 */

import YearMonthDay from 'common/lib/YearMonthDay';

import invariant from 'invariant';
import request from 'request';

import type { ID } from 'common/types/core';
import type {
  AccountContainer,
  Account,
  Provider,
  ProviderAccount,
  Transaction,
  YMDString,
} from 'common/types/yodlee-v1.1';

const BASE_URI = 'https://developer.api.yodlee.com/ysl';

type ErrorResponse = Object;

// -----------------------------------------------------------------------------
//
// AUTHENTICATION
//
// -----------------------------------------------------------------------------

export type AuthPayload = AuthPayload$Cobrand | AuthPayload$CobrandAndUser;

export type AuthPayload$Cobrand = {|
  +cobrandSession: string,
  +type: 'COBRAND',
|};

export type AuthPayload$CobrandAndUser = {|
  +cobrandSession: string,
  +type: 'COBRAND_AND_USER',
  userSession: string,
|};

async function genCobrandAuth(
  login: string,
  password: string,
  locale: string,
): Promise<AuthPayload$Cobrand> {
  const payload = {
    cobrand: {
      cobrandLogin: login,
      cobrandPassword: password,
      locale,
    },
  };

  const response = await genPostRequest(
    null,
    `${BASE_URI}/cobrand/login`,
    payload,
  );

  return {
    cobrandSession: response.session.cobSession,
    type: 'COBRAND',
  };
}

async function genUserAuth(
  auth: AuthPayload$Cobrand,
  login: string,
  password: string,
  locale: string,
): Promise<AuthPayload$CobrandAndUser> {
  const payload = {
    user: {
      loginName: login,
      password,
      locale,
    },
  };

  const response = await genPostRequest(
    auth,
    `${BASE_URI}/user/login`,
    payload,
  );

  return {
    cobrandSession: auth.cobrandSession,
    type: 'COBRAND_AND_USER',
    userSession: response.user.session.userSession,
  };
}

// -----------------------------------------------------------------------------
//
// PROVIDERS
//
// -----------------------------------------------------------------------------

export type ProviderQuery = {
  limit: number,
  offset?: number,
};

const DEFAULT_PROVIDER_QUERY = { limit: 20 };

async function genFetchProviders(
  auth: AuthPayload$CobrandAndUser,
  query: ProviderQuery = DEFAULT_PROVIDER_QUERY,
): Promise<Array<Provider>> {
  const { limit } = query;
  const offset = query.offset || 0;

  const uri = `${BASE_URI}/providers?top=${limit}&top=${offset}`;
  const response = await genGetRequest(auth, uri);
  return response.provider;
}

async function genFetchProvider(
  auth: AuthPayload$CobrandAndUser,
  providerID: ID,
): Promise<Provider | null> {
  const uri = `${BASE_URI}/providers/${providerID}`;
  try {
    const response = await genGetRequest(auth, uri);
    return response.provider ? response.provider[0] : null;
  } catch (error) {
    if (error.errorCode === 'Y806') {
      // Invalid input, could happen if ID cannot be cast to a number.
      return null;
    }
    throw error;
  }
}

// -----------------------------------------------------------------------------
//
// PROVIDER ACCOUNTS
//
// -----------------------------------------------------------------------------

async function genFetchProviderAccount(
  auth: AuthPayload$CobrandAndUser,
  providerAccountID: ID,
): Promise<ProviderAccount | null> {
  const uri = `${BASE_URI}/providerAccounts/${providerAccountID}`;
  try {
    const response = await genGetRequest(auth, uri);
    return response.providerAccount ? response.providerAccount[0] : null;
  } catch (error) {
    if (error.errorCode === 'Y807' || error.errorCode === 'Y806') {
      return null;
    }
    throw error;
  }
}

async function genFetchProviderAccounts(
  auth: AuthPayload$CobrandAndUser,
): Promise<Array<ProviderAccount>> {
  const uri = `${BASE_URI}/providerAccounts`;
  const response = await genGetRequest(auth, uri);
  return response.providerAccount || [];
}

// TODO: NO_AUTOMATED_TESTING
async function genDeleteProviderAccount(
  auth: AuthPayload$CobrandAndUser,
  providerAccountID: ID,
): Promise<void> {
  const uri = `${BASE_URI}/providerAccounts/${providerAccountID}`;
  await genDeleteRequest(auth, uri);
}

// -----------------------------------------------------------------------------
//
// ACCOUNTS
//
// -----------------------------------------------------------------------------

async function genFetchAccount(
  auth: AuthPayload$CobrandAndUser,
  accountID: ID,
  accountContainer: AccountContainer,
): Promise<Account | null> {
  const uri = `${BASE_URI}/accounts/${accountID}?container=${accountContainer}`;
  try {
    const response = await genGetRequest(auth, uri);
    return response.account ? response.account[0] : null;
  } catch (error) {
    if (error.errorCode === 'Y807' || error.errorCode === 'Y806') {
      return null;
    }
    throw error;
  }
}

async function genFetchAccounts(
  auth: AuthPayload$CobrandAndUser,
): Promise<Array<Account>> {
  const uri = `${BASE_URI}/accounts`;
  const response = await genGetRequest(auth, uri);
  return response.account;
}

// -----------------------------------------------------------------------------
//
// TRANSACTIONS
//
// -----------------------------------------------------------------------------

export type TransactionQuery = {
  limit: number,
  offset?: number,
  startDate?: YearMonthDay,
};

const DEFAULT_TRANSACTION_QUERY = { limit: 20 };

function createTransactionURI(
  providerAccountID: ID,
  query: TransactionQuery,
): string {
  const queryComponents = [
    `top=${query.limit}`,
    query.offset ? `skip=${query.offset}` : null,
    query.startDate ? `fromDate=${createStringFromYMD(query.startDate)}` : null,
  ].filter(Boolean);
  return `${BASE_URI}/transactions?accountId=${providerAccountID}&${queryComponents.join(
    '&',
  )}`;
}

async function genFetchTransactions(
  auth: AuthPayload$CobrandAndUser,
  providerAccountID: ID,
  query: TransactionQuery = DEFAULT_TRANSACTION_QUERY,
): Promise<Array<Transaction>> {
  const uri = createTransactionURI(providerAccountID, query);
  const response = await genGetRequest(auth, uri);
  return response.transaction || [];
}

// -----------------------------------------------------------------------------
//
// EXPORT
//
// -----------------------------------------------------------------------------

export default {
  genCobrandAuth,
  genDeleteProviderAccount,
  genFetchAccount,
  genFetchAccounts,
  genFetchProvider,
  genFetchProviderAccount,
  genFetchProviderAccounts,
  genFetchProviders,
  genFetchTransactions,
  genUserAuth,
};

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function genDeleteRequest<TResponse: Object>(
  auth: AuthPayload | null,
  uri: string,
  body: Object = {},
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const options = {
      body: JSON.stringify(body),
      headers: getHeaders(auth),
      method: 'DELETE',
      uri,
    };

    const onComplete = (error: Error, response: Object, serialized: string) => {
      if (error) {
        reject(error);
        return;
      }

      serialized = serialized || '{}';

      let payload;
      try {
        payload = JSON.parse(serialized);
      } catch (error) {
        reject(error);
        return;
      }

      if (payload.errorCode) {
        reject((payload: ErrorResponse));
        return;
      }
      resolve((payload: TResponse));
    };
    request(options, onComplete);
  });
}

function genPostRequest<TResponse: Object>(
  auth: AuthPayload | null,
  uri: string,
  body: Object,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const options = {
      body: JSON.stringify(body),
      headers: getHeaders(auth),
      method: 'POST',
      uri,
    };

    const onComplete = (error: Error, response: Object, serialized: string) => {
      if (error) {
        reject(error);
        return;
      }
      let payload;
      try {
        payload = JSON.parse(serialized);
      } catch (error) {
        reject(error);
        return;
      }
      if (payload.errorCode) {
        reject((payload: ErrorResponse));
        return;
      }
      resolve((payload: TResponse));
    };

    request(options, onComplete);
  });
}

function genGetRequest<TResponse: Object>(
  auth: AuthPayload,
  uri: string,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: getHeaders(auth),
      method: 'GET',
      uri,
    };

    const onComplete = (error: Error, response: Object, serialized: string) => {
      if (error) {
        reject(error);
        return;
      }
      let payload;
      try {
        payload = JSON.parse(serialized);
      } catch (error) {
        reject(error);
        return;
      }
      if (payload.errorCode) {
        reject((payload: ErrorResponse));
        return;
      }
      resolve((payload: TResponse));
    };

    request(options, onComplete);
  });
}

// eslint-disable-next-line no-unused-vars
function genPutRequest<TResponse: Object>(
  auth: AuthPayload,
  uri: string,
  body: Object = {},
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const options = {
      body: JSON.stringify(body),
      headers: getHeaders(auth),
      method: 'PUT',
      uri,
    };

    const onComplete = (error: Error, response: Object, serialized: string) => {
      if (error) {
        reject(error);
        return;
      }
      let payload;
      try {
        payload = JSON.parse(serialized);
      } catch (error) {
        reject(error);
        return;
      }

      if (payload.errorCode) {
        reject((payload: ErrorResponse));
        return;
      }
      resolve((payload: TResponse));
    };
    request(options, onComplete);
  });
}

function getHeaders(auth: AuthPayload | null) {
  if (!auth) {
    return {
      'Api-Version': '1.1',
      'Cobrand-Name': 'restserver',
      'Content-Type': 'application/json',
    };
  }

  switch (auth.type) {
    case 'COBRAND':
      return {
        'Api-Version': '1.1',
        Authorization: `cobSession=${auth.cobrandSession}`,
        'Cobrand-Name': 'restserver',
        'Content-Type': 'application/json',
      };

    case 'COBRAND_AND_USER':
      return {
        'Api-Version': '1.1',
        Authorization: `cobSession=${auth.cobrandSession},userSession=${
          auth.userSession
        }`,
        'Cobrand-Name': 'restserver',
        'Content-Type': 'application/json',
      };

    default:
      invariant(false, 'Unrecognized auth payload: %s', auth.type);
  }
}

// eslint-disable-next-line no-unused-vars
function createYMDFromString(str: YMDString): YearMonthDay {
  const serializedComponents = str.split('-');
  if (serializedComponents.length !== 3) {
    throw Error('Expecting string to be in format: YYYY-MM-DD');
  }
  const [year, month, day] = serializedComponents.map(str => parseInt(str, 10));
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    throw Error('Expecting string to be in format: YYYY-MM-DD');
  }
  return YearMonthDay.create(year, month - 1, day);
}

function createStringFromYMD(ymd: YearMonthDay): YMDString {
  const monthFormatted =
    ymd.month < 10 ? `0${ymd.month + 1}` : `${ymd.month + 1}`;
  const dayFormatted = ymd.day < 10 ? `0${ymd.day}` : `${ymd.day}`;
  return `${ymd.year}-${monthFormatted}-${dayFormatted}`;
}
