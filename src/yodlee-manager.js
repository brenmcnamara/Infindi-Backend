/* @flow */

import YodleeClient from './YodleeClient';

import invariant from 'invariant';

import { genFetchYodleeCredentials } from 'common/lib/models/YodleeCredentials';
import { handleError } from './route-utils';
import { INFO } from './log-utils';

import type { ID } from 'common/types/core';
import type { RouteHandler } from './middleware';

let yodleeClient: YodleeClient | null = null;
let genWaitForCobrandLogin: Promise<void> | null = null;
const userToYodleeSession: { [userID: string]: string } = {};

export function initialize(): void {
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

export function getYodleeClient(): YodleeClient {
  invariant(
    yodleeClient,
    'Yodlee Manager must be initialized before being used',
  );
  return yodleeClient;
}

export async function genCheckAndRefreshYodleeUserSession(
  userID: ID,
): Promise<string> {
  const credentials = await genFetchYodleeCredentials(userID);
  await genWaitForCobrandLogin;
  const yodleeClient = getYodleeClient();
  if (userToYodleeSession[userID]) {
    const session = userToYodleeSession[userID];
    const isActiveSession = await yodleeClient.genIsActiveSession(session);
    if (isActiveSession) {
      INFO('YODLEE', 'User session has expired. Creating new session');
      return session;
    }
    delete userToYodleeSession[userID];
  }
  INFO('YODLEE', 'No user session exists. Creating new session');
  const session = await yodleeClient.genLoginUser(
    credentials.loginName,
    credentials.password,
  );
  userToYodleeSession[userID] = session;
  return session;
}

export function performYodleeUserLogin(): RouteHandler {
  return handleError(async (req, res, next) => {
    const { decodedIDToken } = req;
    invariant(
      decodedIDToken,
      'Must use authorization middleware before performYodleeUserLogin',
    );
    const userID: ID = decodedIDToken.uid;
    const session = await genCheckAndRefreshYodleeUserSession(userID);
    req.yodleeUserSession = session;
    next();
  }, true);
}
