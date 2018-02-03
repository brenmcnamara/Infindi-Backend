/* @flow */

import AlgoliaSearch from 'algoliasearch';
import YodleeClient from '../YodleeClient';

import express from 'express';
import invariant from 'invariant';

import { checkAuth } from '../middleware';
import {
  createRefreshInfo,
  genCreateRefreshInfo,
  genFetchRefreshInfoForProvider,
  isPending,
  updateRefreshInfo,
} from 'common/lib/models/YodleeRefreshInfo';
import { genFetchProvider } from 'common/lib/models/YodleeProvider';
import { genFetchYodleeCredentials } from 'common/lib/models/YodleeCredentials';
import { handleError } from '../route-utils';
import { INFO } from '../log-utils';

import type { ID } from 'common/types/core';
import type { RouteHandler } from '../middleware';
import type { ProviderFull as RawYodleeProvider } from 'common/types/yodlee';
import type { YodleeRefreshInfo } from 'common/lib/models/YodleeRefreshInfo';

const router = express.Router();

export default router;

let providerIndex: Object | null = null;
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
  INFO('YODLEE', 'Initializing algolia search');
  const algolia = AlgoliaSearch(
    process.env.ALGOLIA_APP_ID,
    process.env.ALGOLIA_API_KEY,
  );
  providerIndex = algolia.initIndex('YodleeProviders');
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
// GET yodlee/providers/search?limit=<n>&page=<n>&query=<s>
//
// -----------------------------------------------------------------------------

function validateProviderSearch(): RouteHandler {
  return handleError((req, res, next) => {
    const limit = parseInt(req.query.limit, 10);
    const page = parseInt(req.query.page, 10);
    const query = req.query.query;

    if (typeof limit !== 'number' || Number.isNaN(limit)) {
      throw {
        errorCode: 'infindi/bad-request',
        errorMessage: 'Must have query attribute "limit" of type number',
      };
    } else if (typeof page !== 'number' || Number.isNaN(page)) {
      throw {
        errorCode: 'infindi/bad-request',
        errorMessage: 'Must have query attribute "page" of type number',
      };
    } else if (typeof query !== 'string') {
      throw {
        errorCode: 'infindi/bad-request',
        errorMessage: 'Must have query attribute "query" of type string',
      };
    }
    req.query.limit = limit;
    req.query.offset = page;
    next();
  });
}

function performProviderSearch(): RouteHandler {
  return handleError(async (req, res) => {
    const index = getProviderIndex();
    const chase = await genFetchProvider('643');
    res.json({
      data: [chase],
    });
    return;
    // TODO: I hit a quota. Need to come down from the quota.
    const result = await index.search({
      hitsPerPage: req.query.limit,
      page: req.query.page,
      query: req.query.query,
    });
    res.json({
      data: result.hits,
      limit: req.query.limit,
      page: req.query.offset,
    });
  }, true);
}

router.get('/providers/search', checkAuth());
router.get('/providers/search', validateProviderSearch());
router.get('/providers/search', performProviderSearch());

// -----------------------------------------------------------------------------
//
// POST yodlee/providers/login
//
// -----------------------------------------------------------------------------

function validateProviderLogin(): RouteHandler {
  return handleError(async (req, res, next) => {
    const provider: RawYodleeProvider = req.body.provider;
    const userID: ID = req.decodedIDToken.uid;
    const refreshInfo = await genFetchRefreshInfoForProvider(
      userID,
      String(provider.id),
    );
    if (refreshInfo && isPending(refreshInfo)) {
      throw {
        errorCode: 'infindi/bad-request',
        errorMessage: 'Provider is already being logged in',
      };
    }
    req.refreshInfo = refreshInfo;
    // TODO: Throw error if trying to login with a provider that is in the
    // middle of a login.
    next();
  }, true);
}

function performProviderLogin(): RouteHandler {
  return handleError(async (req, res) => {
    const provider: RawYodleeProvider = req.body.provider;
    const yodleeClient = getYodleeClient();
    const yodleeUserSession: string = req.yodleeUserSession;
    const loginPayload = await yodleeClient.genProviderLogin(
      yodleeUserSession,
      provider,
    );
    const rawRefreshInfo = loginPayload.refreshInfo;
    const userID: ID = req.decodedIDToken.uid;
    const providerID = String(provider.id);
    const providerAccountID = String(loginPayload.providerAccountId);
    const refreshInfo: YodleeRefreshInfo = req.refreshInfo
      ? updateRefreshInfo(req.refreshInfo, rawRefreshInfo)
      : createRefreshInfo(
          rawRefreshInfo,
          userID,
          providerID,
          providerAccountID,
        );

    await genCreateRefreshInfo(refreshInfo);
    res.send({
      data: {
        pointerType: 'YodleeRefreshInfo',
        type: 'POINTER',
        refID: refreshInfo.id,
      },
    });
  }, true);
}

router.post('/providers/login', checkAuth());
router.post('/providers/login', performYodleeUserLogin());
router.post('/providers/login', validateProviderLogin());
router.post('/providers/login', performProviderLogin());

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function performYodleeUserLogin(): RouteHandler {
  return handleError(async (req, res, next) => {
    const userID: ID = req.decodedIDToken.uid;
    const credentials = await genFetchYodleeCredentials(userID);
    await genWaitForCobrandLogin;
    const yodleeClient = getYodleeClient();
    if (userToYodleeSession[userID]) {
      const session = userToYodleeSession[userID];
      const isActiveSession = await yodleeClient.genIsActiveSession(session);
      if (isActiveSession) {
        INFO('YODLEE', 'User session has expired. Creating new session');
        req.yodleeUserSession = session;
        next();
        return;
      }
      delete userToYodleeSession[userID];
    }
    INFO('YODLEE', 'No user session exists. Creating new session');
    const session = await yodleeClient.genLoginUser(
      credentials.loginName,
      credentials.password,
    );
    userToYodleeSession[userID] = session;
    req.yodleeUserSession = session;
    next();
  }, true);
}

function getProviderIndex(): Object {
  invariant(
    providerIndex,
    'Trying to access providerIndex before routes have been initialized',
  );
  return providerIndex;
}

function getYodleeClient(): YodleeClient {
  invariant(
    yodleeClient,
    'Trying to access yodlee client before initialization',
  );
  return yodleeClient;
}
