/* @flow */

import invariant from 'invariant';
import nullthrows from 'nullthrows';
import request from 'request';

import type {
  Account,
  AccessToken,
  Locale,
  Long,
  Provider,
  ProviderFull,
  ProviderAccount,
  RefreshInfo,
  User,
} from 'common/types/yodlee';

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

type ProviderAccountResponse = {|
  +providerAccount: Array<ProviderAccount>,
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

type ProviderLoginResponse = {|
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

  genLoginUser(loginName: string, password: string): Promise<void> {
    return this._genValidateCobrandLogin()
      .then(() => {
        const request = {
          user: {
            loginName,
            password,
            locale: nullthrows(this._locale),
          },
        };
        return this._genPostRequest(`${BASE_URI}/user/login`, request);
      })
      .then((response: UserLoginResponse) => {
        this._currentUser = response.user;
      });
  }

  genLogoutUser(): Promise<void> {
    return this._genValidateUserLogin()
      .then(() => this._genPostRequest(`${BASE_URI}/user/logout`, {}))
      .then(() => {
        this._currentUser = null;
      });
  }

  genFastLinkToken(): Promise<AccessToken> {
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin())
      .then(() =>
        this._genGetRequest(`${BASE_URI}/user/accessTokens?appIds=10003620`),
      )
      .then((response: AccessTokensResponse) => {
        return response.user.accessTokens[0];
      });
  }

  genProviders(
    offset: number = 0,
    limit: number = 500,
  ): Promise<Array<Provider>> {
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin())
      .then(() => {
        const uri =
          offset === 0
            ? `${BASE_URI}/providers?top=${limit}`
            : `${BASE_URI}/providers?skip=${offset}&top=${limit}`;
        return this._genGetRequest(uri);
      })
      .then((response: ProvidersResponse) => response.provider);
  }

  genProviderFull(id: number): Promise<ProviderFull | null> {
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin())
      .then(() => this._genGetRequest(`${BASE_URI}/providers/${id}`))
      .then(
        (response: ProviderResponse) =>
          response.provider ? response.provider[0] : null,
      );
  }

  genProviderLogin(providerFull: ProviderFull): Promise<ProviderLoginResponse> {
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin())
      .then(() =>
        this._genPostRequest(`${BASE_URI}/providers/${providerFull.id}`, {
          provider: [providerFull],
        }),
      );
  }

  genProviderAccounts(): Promise<Array<ProviderAccount>> {
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin())
      .then(() => this._genGetRequest(`${BASE_URI}/providerAccounts`))
      .then((response: ProviderAccountResponse) => {
        return response.providerAccount;
      });
  }

  genAccounts(): Promise<Array<Account>> {
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin())
      .then(() => this._genGetRequest(`${BASE_URI}/accounts`))
      .then((response: AccountsResponse) => response.account);
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

  _genValidateUserLogin(): Promise<void> {
    return new Promise(resolve => {
      if (!this._currentUser) {
        throw Error('User must be logged in');
      }
      resolve();
    });
  }

  _genPostRequest<TResponse: Object>(
    uri: string,
    body: Object,
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      const options = {
        headers: this._getHeaders(),
        method: 'POST',
        body: JSON.stringify(body),
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

  _genGetRequest<TResponse: Object>(uri: string): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      const options = {
        headers: this._getHeaders(),
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

  _getHeaders() {
    invariant(
      this._cobrandSession,
      'Must authorize cobrand before using this client',
    );
    return {
      Authorization: this._currentUser
        ? `cobSession=${this._cobrandSession},userSession=${
            this._currentUser.session.userSession
          }`
        : `cobSession=${this._cobrandSession}`,
      'Content-Type': 'application/json',
    };
  }
}
