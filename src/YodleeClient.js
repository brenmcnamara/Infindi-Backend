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
  _userSessions: { [session: string]: User };

  constructor() {
    this._applicationID = null;
    this._cobrandID = null;
    this._cobrandSession = null;
    this._currentUser = null;
    this._locale = null;
    this._userSessions = {};
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
      .then((response: UserLoginResponse) => {
        const user = response.user;
        const session = user.session.userSession;
        // Check if there is any session with this user already. If so,
        // delete it.
        for (const session in this._userSessions) {
          if (
            this._userSessions.hasOwnProperty(session) &&
            user.id === this._userSessions[session].id
          ) {
            delete this._userSessions[session];
          }
        }

        this._userSessions[session] = user;
        return session;
      });
  }

  genIsActiveSession(userSession: string): Promise<bool> {
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin(userSession))
      .then(() => {
        const uri = `${BASE_URI}/user`;
        return this._genGetRequest(userSession, uri)
          .then(() => true)
          .catch(() => false);
      });
  }

  genLogoutUser(userSession: string): Promise<void> {
    return this._genValidateUserLogin(userSession)
      .then(() =>
        this._genPostRequest(userSession, `${BASE_URI}/user/logout`, {}),
      )
      .then(() => {
        delete this._userSessions[userSession];
      });
  }

  genFastLinkToken(userSession: string): Promise<AccessToken> {
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin(userSession))
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
      .then(() => this._genValidateUserLogin(userSession))
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
      .then(() => this._genValidateUserLogin(userSession))
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
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin(userSession))
      .then(() =>
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
      .then(() => this._genValidateUserLogin(userSession))
      .then(() =>
        this._genGetRequest(userSession, `${BASE_URI}/providerAccounts`),
      )
      .then((response: ProviderAccountsResponse) => {
        return response.providerAccount;
      });
  }

  genProviderAccount(
    userSession: string,
    id: ID,
  ): Promise<ProviderAccount | null> {
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin(userSession))
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

  genAccounts(userSession: string): Promise<Array<Account>> {
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin(userSession))
      .then(() => this._genGetRequest(userSession, `${BASE_URI}/accounts`))
      .then((response: AccountsResponse) => response.account);
  }

  genAccountsForProviderAccount(
    userSession: string,
    id: ID,
  ): Promise<Array<Account>> {
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin(userSession))
      .then(() =>
        this._genGetRequest(
          userSession,
          `${BASE_URI}/accounts?providerAccountId=${id}`,
        ),
      )
      .then((response: AccountsResponse) => response.account || []);
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

  _genValidateUserLogin(session: string): Promise<void> {
    return new Promise(resolve => {
      if (!this._userSessions[session]) {
        throw Error('User must be logged in');
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
        headers: this._getHeaders(userSession),
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
