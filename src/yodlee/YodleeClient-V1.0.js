/* @flow */

import invariant from 'invariant';
import nullthrows from 'nullthrows';
import request from 'request';

import type {
  Account,
  AccessToken,
  Locale,
  LoginForm,
  Long,
  Provider,
  ProviderFull,
  ProviderAccount,
  RefreshInfo,
  Transaction,
  User,
} from 'common/types/yodlee-v1.0';
import type { ID } from 'common/types/core';

const BASE_URI = 'https://developer.api.yodlee.com/ysl/restserver/v1';

// -----------------------------------------------------------------------------
//
// TYPES
//
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
//
// TYPES / REST_API
//
// -----------------------------------------------------------------------------

type ErrorResponse = {|
  +errorCode: string,
  +errorMessage: string,
  +referenceCode: string,
|};

// eslint-disable-next-line no-unused-vars
type CobrandResponse = {|
  +applicationId: string,
  +cobrandId: number,
  +locale: Locale,
  +session: {|
    +cobSession: string,
  |},
|};

type UserLoginResponse = {|
  +user: User,
|};

type ProviderAccountsResponse = {|
  +providerAccount: Array<ProviderAccount>,
|};

type ProviderAccountResponse = {|
  +providerAccount: ProviderAccount,
|};

type AccountsResponse = {|
  +account: Array<Account>,
|};

type AccessTokensResponse = {|
  +user: {|
    +accessTokens: Array<AccessToken>,
  |},
|};

type ProvidersResponse = {|
  +provider: Array<Provider>,
|};

type ProviderResponse = {|
  +provider?: Array<ProviderFull>,
|};

export type ProviderLoginResponse = {|
  +providerAccountId: Long,
  +refreshInfo: RefreshInfo,
|};

// -----------------------------------------------------------------------------
//
// CLIENT
//
// -----------------------------------------------------------------------------

export default class YodleeClient {
  _applicationID: string | null;
  _cobrandID: number | null;
  _cobrandSession: string | null;
  _currentUser: User | null;
  _locale: Locale | null;

  constructor() {
    this._applicationID = null;
    this._cobrandID = null;
    this._cobrandSession = null;
    this._currentUser = null;
    this._locale = null;
  }
  // ---------------------------------------------------------------------------
  //
  // GETTERS
  //
  // ---------------------------------------------------------------------------

  getCurrentUser() {
    return this._currentUser;
  }

  // ---------------------------------------------------------------------------
  //
  // ASYNC
  //
  // ---------------------------------------------------------------------------

  // TODO: May want to support multiple simultaneous cobrand sessions in
  // the future.
  genCobrandAuth(
    login: string,
    password: string,
    locale: Locale,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify({
          cobrand: {
            cobrandLogin: login,
            cobrandPassword: password,
            locale,
          },
        }),
        uri: `${BASE_URI}/cobrand/login`,
      };

      const onComplete = (error: Error, response: Object, body: string) => {
        if (error) {
          reject(error);
          return;
        }
        const json = JSON.parse(body);
        if (json.errorCode) {
          reject(json);
          return;
        }
        this._applicationID = json.applicationId;
        this._cobrandID = json.cobrandId;
        this._cobrandSession = json.session.cobSession;
        this._locale = json.locale;
        resolve();
      };

      request(options, onComplete);
    });
  }

  /**
   * Login the user and get the session token back for the login.
   */
  genLoginUser(loginName: string, password: string): Promise<string> {
    return this._genValidateCobrandLogin()
      .then(() => {
        const request = {
          user: {
            loginName,
            password,
            locale: nullthrows(this._locale),
          },
        };
        return this._genPostRequest(null, `${BASE_URI}/user/login`, request);
      })
      .then((response: UserLoginResponse) => response.user.session.userSession);
  }

  genIsActiveSession(userSession: string): Promise<boolean> {
    return this._genValidateCobrandLogin().then(() => {
      const uri = `${BASE_URI}/user`;
      return this._genGetRequest(userSession, uri)
        .then(() => true)
        .catch(() => false);
    });
  }

  genLogoutUser(userSession: string): Promise<void> {
    return this._genPostRequest(userSession, `${BASE_URI}/user/logout`, {});
  }

  genFastLinkToken(userSession: string): Promise<AccessToken> {
    return this._genValidateCobrandLogin()
      .then(() =>
        this._genGetRequest(
          userSession,
          `${BASE_URI}/user/accessTokens?appIds=10003620`,
        ),
      )
      .then((response: AccessTokensResponse) => {
        return response.user.accessTokens[0];
      });
  }

  genProviders(
    userSession: string,
    offset: number = 0,
    limit: number = 500,
  ): Promise<Array<Provider>> {
    return this._genValidateCobrandLogin()
      .then(() => {
        const uri =
          offset === 0
            ? `${BASE_URI}/providers?top=${limit}`
            : `${BASE_URI}/providers?skip=${offset}&top=${limit}`;
        return this._genGetRequest(userSession, uri);
      })
      .then((response: ProvidersResponse) => response.provider);
  }

  genProviderFull(
    userSession: string,
    id: number,
  ): Promise<ProviderFull | null> {
    return this._genValidateCobrandLogin()
      .then(() =>
        this._genGetRequest(userSession, `${BASE_URI}/providers/${id}`),
      )
      .then(
        (response: ProviderResponse) =>
          response.provider ? response.provider[0] : null,
      );
  }

  genProviderLogin(
    userSession: string,
    providerFull: ProviderFull,
  ): Promise<ProviderLoginResponse> {
    return this._genValidateCobrandLogin().then(() =>
      this._genPostRequest(
        userSession,
        `${BASE_URI}/providers/${providerFull.id}`,
        {
          provider: [providerFull],
        },
      ),
    );
  }

  genProviderAccounts(userSession: string): Promise<Array<ProviderAccount>> {
    return this._genValidateCobrandLogin()
      .then(() =>
        this._genGetRequest(userSession, `${BASE_URI}/providerAccounts`),
      )
      .then((response: ProviderAccountsResponse) => {
        return response.providerAccount || [];
      });
  }

  genProviderAccount(
    userSession: string,
    id: ID,
  ): Promise<ProviderAccount | null> {
    return this._genValidateCobrandLogin()
      .then(() =>
        this._genGetRequest(userSession, `${BASE_URI}/providerAccounts/${id}`),
      )
      .then((response: ProviderAccountResponse) => response.providerAccount)
      .catch(error => {
        if (error.errorCode === 'Y807') {
          return null;
        }
        throw error;
      });
  }

  genProviderAccountRefresh(
    userSession: string,
    providerAccountID: ID,
  ): Promise<ProviderAccount | null> {
    return this._genValidateCobrandLogin()
      .then(() =>
        this._genPutRequest(
          userSession,
          `${BASE_URI}/providerAccounts?providerAccountIds=${providerAccountID}`,
        ),
      )
      .then(response => response.providerAccount[0] || null);
  }

  genProviderAccountMFALogin(
    userSession: string,
    providerAccountID: ID,
    loginForm: LoginForm,
  ): Promise<*> {
    return this._genValidateCobrandLogin().then(() => {
      const request = { loginForm };
      return this._genPutRequest(
        userSession,
        `${BASE_URI}/providerAccounts?providerAccountIds=${providerAccountID}`,
        request,
      );
    });
  }

  genDeleteProviderAccount(
    userSession: string,
    providerAccountID: ID,
  ): Promise<*> {
    return this._genValidateCobrandLogin().then(() =>
      this._genDeleteRequest(
        userSession,
        `${BASE_URI}/providerAccounts/${providerAccountID}`,
      ),
    );
  }

  genAccounts(userSession: string): Promise<Array<Account>> {
    return this._genValidateCobrandLogin()
      .then(() => this._genGetRequest(userSession, `${BASE_URI}/accounts`))
      .then((response: AccountsResponse) => response.account);
  }

  genAccountsForProviderAccount(
    userSession: string,
    id: ID,
  ): Promise<Array<Account>> {
    return this._genValidateCobrandLogin()
      .then(() =>
        this._genGetRequest(
          userSession,
          `${BASE_URI}/accounts?providerAccountId=${id}`,
        ),
      )
      .then((response: AccountsResponse) => response.account || []);
  }

  /**
   * Returns undefined if it does not make sense for the give account to have
   * transactions. (i.e. Rewards accounts)
   */
  // TODO: This throws an error if the account id cannot be found. Better to
  // return an empty array.
  genTransactions(
    userSession: string,
    accountID: ID,
  ): Promise<?Array<Transaction>> {
    return this._genValidateCobrandLogin()
      .then(() =>
        this._genGetRequest(
          userSession,
          `${BASE_URI}/transactions?accountId=${accountID}`,
        ),
      )
      .then(response => response.transaction || []);
  }

  genTransactionsFromDate(
    userSession: string,
    accountID: ID,
    date: Date,
  ): Promise<Array<Transaction>> {
    const yearString = date.getUTCFullYear().toString();
    const monthString =
      date.getUTCMonth() < 9
        ? `0${date.getUTCMonth() + 1}`
        : (date.getUTCMonth() + 1).toString();
    const dayString =
      date.getUTCDate() < 10
        ? `0${date.getUTCDate()}`
        : date.getUTCDate().toString();
    const fromDateString = `${yearString}-${monthString}-${dayString}`;
    return this._genValidateCobrandLogin()
      .then(() =>
        this._genGetRequest(
          userSession,
          `${BASE_URI}/transactions?accountId=${accountID}&fromDate=${fromDateString}`,
        ),
      )
      .then(response => response.transaction || []);
  }

  // ---------------------------------------------------------------------------
  //
  // UTILITIES
  //
  // ---------------------------------------------------------------------------

  _genValidateCobrandLogin(): Promise<void> {
    return new Promise(resolve => {
      if (!this._cobrandSession) {
        throw Error('Must be logged in with cobrand');
      }
      resolve();
    });
  }

  _genPostRequest<TResponse: Object>(
    userSession: string | null,
    uri: string,
    body: Object,
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      const options = {
        body: JSON.stringify(body),
        headers: this._getHeaders(userSession),
        method: 'POST',
        uri,
      };

      const onComplete = (
        error: Error,
        response: Object,
        serialized: string,
      ) => {
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

  _genGetRequest<TResponse: Object>(
    userSession: string | null,
    uri: string,
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      const options = {
        headers: this._getHeaders(userSession),
        method: 'GET',
        uri,
      };

      const onComplete = (
        error: Error,
        response: Object,
        serialized: string,
      ) => {
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

  _genPutRequest<TResponse: Object>(
    userSession: string | null,
    uri: string,
    body: Object = {},
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      const options = {
        body: JSON.stringify(body),
        headers: this._getHeaders(userSession),
        method: 'PUT',
        uri,
      };

      const onComplete = (
        error: Error,
        response: Object,
        serialized: string,
      ) => {
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

  _genDeleteRequest<TResponse: Object>(
    userSession: string | null,
    uri: string,
    body: Object = {},
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      const options = {
        body: JSON.stringify(body),
        headers: this._getHeaders(userSession),
        method: 'DELETE',
        uri,
      };

      const onComplete = (
        error: Error,
        response: Object,
        serialized: string,
      ) => {
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

  _getHeaders(userSession: string | null = null) {
    invariant(
      this._cobrandSession,
      'Must authorize cobrand before using this client',
    );
    return {
      Authorization: userSession
        ? `cobSession=${this._cobrandSession},userSession=${userSession}`
        : `cobSession=${this._cobrandSession}`,
      'Content-Type': 'application/json',
    };
  }
}
