/* @flow */

import invariant from 'invariant';
import nullthrows from 'nullthrows';
import request from 'request';

const BASE_URI = 'https://developer.api.yodlee.com';

// -----------------------------------------------------------------------------
//
// TYPES
//
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
//
// TYPES / DATA MODEL
//
// https://developer.yodlee.com/Data_Model/Overview
//
// -----------------------------------------------------------------------------

export type DateString = string; // yyyy-MM-dd

export type DateTimeString = string; // 2017-11-14T04:23:10Z

// NOTE: Javascript does not support longs. Need to extract this from the
// request as a string to avoid overflows.
export type Long = number;

// TODO: MORE HERE
export type Currency = 'USD';

// TODO: MORE HERE
export type DateFormat = 'MM/dd/yyyy';

// TODO: MORE HERE
export type Locale = 'en_US';

// TODO: MORE HERE
export type Timezone = 'PST';

export type Preference = {|
  +currency: Currency,
  +dateFormat: DateFormat,
  +locale: Locale,
  +timezone: Timezone,
|};

export type User = {|
  +id: Long,
  +loginName: string,
  +name: {|
    +first: string,
    +last: string,
  |},
  +preferences: Preference,
  +roleType: 'INDIVIDUAL',
  +session: {|
    +userSession: string,
  |},
|};

export type ProviderAccount = {|
  +aggregationSource: 'USER' | 'SYSTEM',
  +createdDate: DateString,
  +id: Long,
  +isManual: bool,
  +lastUpdated: DateTimeString,
  +loginForm: LoginForm,
  +providerId: Long,
  +refreshInfo: RefreshInfo,
|};

// Account types and containers can be found here:
// https://developer.yodlee.com/Data_Model/Resource_Provider_Accounts
export type Account = {|
  +accountNumber: string,
  +accountStatus: 'ACTIVE' | 'TO_BE_CLOSED' | string,
  +accountType: 'INDIVIDUAL' | string,
  +aggregationSource: 'USER' | 'SYSTEM',
  +availableBalance?: AccountBalance,
  +balance?: AccountBalance,
  +bankTransferCode?: {| +id: string |},
  +cash?: AccountBalance, // Found this field in my schwab account.
  +CONTAINER: string,
  +createdDate: DateTimeString,
  +currentBalance?: AccountBalance,
  +holderProfile?: Object, // Found this field in my schwab account.
  +id: Long,
  +includeInNetWorth?: bool,
  +isAsset: bool,
  +isManual: bool,
  +lastUpdated: DateTimeString,
  +providerAccountId: Long,
  +providerId: string,
  +providerName: string,
  +refreshinfo: RefreshInfo,
|};

export type AccountBalance = {|
  +amount: number,
  +currency: Currency,
|};

export type RefreshInfo = {|
  +lastRefreshed: DateTimeString,
  +lastRefreshAttempt: DateTimeString,
  +nextRefreshScheduled: DateTimeString,
  +status: string,
  +statusCode: number,
  +statusMessage: string,
|};

export type LoginForm = {||};

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
        uri: `${BASE_URI}/ysl/restserver/v1/cobrand/login`,
      };

      const onComplete = (error: Error, response: Object, body: string) => {
        if (error) {
          reject(error);
          return;
        }
        const json: CobrandResponse = JSON.parse(body);
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
        const uri = `${BASE_URI}/ysl/restserver/v1/user/login`;
        const request = {
          user: {
            loginName,
            password,
            locale: nullthrows(this._locale),
          },
        };
        return this._genPostRequest(uri, request);
      })
      .then((response: UserLoginResponse) => {
        this._currentUser = response.user;
      });
  }

  genLogoutUser(): Promise<void> {
    return this._genValidateUserLogin()
      .then(() => {
        const uri = `${BASE_URI}/ysl/restserver/v1/user/logout`;
        return this._genPostRequest(uri, {});
      })
      .then(() => {
        this._currentUser = null;
      });
  }

  genProviderAccounts(): Promise<Array<ProviderAccount>> {
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin())
      .then(() => {
        const uri = `${BASE_URI}/ysl/restserver/v1/providerAccounts`;
        return this._genGetRequest(uri);
      })
      .then((response: ProviderAccountResponse) => {
        return response.providerAccount;
      });
  }

  genAccounts(): Promise<Array<Account>> {
    return this._genValidateCobrandLogin()
      .then(() => this._genValidateUserLogin())
      .then(() => {
        const uri = `${BASE_URI}/ysl/restserver/v1/accounts`;
        return this._genGetRequest(uri);
      })
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
