/* @flow */

/**
 * This module is a client-side abstraction to the Yodlee API. Docs can be
 * viewed here: https://developer.yodlee.com/apidocs/index.php
 */

import * as Immutable from 'immutable';
import YearMonthDay from 'common/lib/YearMonthDay';

import invariant from 'invariant';
import request from 'request';

import type { ID } from 'common/types/core';
import type {
  Provider,
  ProviderAccount,
  ProviderOrderedCollection,
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

async function genFetchProviders(
  auth: AuthPayload$CobrandAndUser,
  limit: number,
  offset: number,
): Promise<ProviderOrderedCollection> {
  const uri = `${BASE_URI}/providers?top=${limit}&top=${offset}`;
  const response = await genGetRequest(auth, uri);
  // $FlowFixMe - Flow is being dumb.
  return Immutable.OrderedMap(
    response.provider.map(provider => {
      const providerID = String(provider.id);
      return [providerID, provider];
    }),
  );
}

async function genFetchProvider(
  auth: AuthPayload$CobrandAndUser,
  providerID: ID,
): Promise<Provider | null> {
  const uri = `${BASE_URI}/providers/${providerID}`;
  try {
    const response = await genGetRequest(auth, uri);
    return response.provider || null;
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
    return response.providerAccount || null;
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
