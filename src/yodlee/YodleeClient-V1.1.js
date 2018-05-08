/* @flow */

import invariant from 'invariant';
import request from 'request';

const BASE_URI = 'https://developer.api.yodlee.com/ysl';

type ErrorResponse = Object;

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

export default {
  genCobrandAuth,
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
