/* @flow */

import AlgoliaSearch from 'algoliasearch';
import YodleeClient from '../YodleeClient';

import express from 'express';
import invariant from 'invariant';
import nullthrows from 'nullthrows';

import { checkAuth } from '../middleware';
import {
  createRefreshInfo,
  genCreateRefreshInfo,
  genFetchRefreshInfoForProvider,
  isPending,
  updateRefreshInfo,
} from 'common/lib/models/YodleeRefreshInfo';
import { handleError } from '../route-utils';

import type { ID } from 'common/types/core';
import type { RouteHandler } from '../middleware';
import type { ProviderFull as RawYodleeProvider } from 'common/types/yodlee';
import type { YodleeRefreshInfo } from 'common/lib/models/YodleeRefreshInfo';

const COBRAND_LOGIN = 'sbCobbrenmcnamara';
const COBRAND_PASSWORD = 'd19ced89-5e46-43da-9b4f-cd5ba339d9ce';
const COBRAND_LOCALE = 'en_US';
const LOGIN_NAME = 'sbMembrenmcnamara1';
const LOGIN_PASSWORD = 'sbMembrenmcnamara1#123';

const router = express.Router();

export default router;

let providerIndex: Object | null = null;
let yodleeClient: YodleeClient | null = null;
let genWaitForLogin: Promise<void> | null = null;

export function initialize(): void {
  const algolia = AlgoliaSearch(
    process.env.ALGOLIA_APP_ID,
    process.env.ALGOLIA_API_KEY,
  );
  providerIndex = algolia.initIndex('YodleeProviders');
  yodleeClient = new YodleeClient();
  genWaitForLogin = yodleeClient
    .genCobrandAuth(COBRAND_LOGIN, COBRAND_PASSWORD, COBRAND_LOCALE)
    .then(() =>
      nullthrows(yodleeClient).genLoginUser(LOGIN_NAME, LOGIN_PASSWORD),
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
    const yodleeClient = await genYodleeClient();
    const loginPayload = await yodleeClient.genProviderLogin(provider);
    const rawRefreshInfo = loginPayload.refreshInfo;
    const userID: ID = req.decodedIDToken.uid;
    const providerID = String(provider.id);
    const providerAccountID = String(loginPayload.providerAccountId);
    const refreshInfo: YodleeRefreshInfo = req.refreshInfo
      ? updateRefreshInfo(req.RefreshInfo, rawRefreshInfo)
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
router.post('/providers/login', validateProviderLogin());
router.post('/providers/login', performProviderLogin());

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function getProviderIndex(): Object {
  invariant(
    providerIndex,
    'Trying to access providerIndex before routes have been initialized',
  );
  return providerIndex;
}

function genYodleeClient(): Promise<YodleeClient> {
  if (!yodleeClient) {
    return Promise.reject({
      errorCode: 'infindi/server-error',
      errorMessage: 'Trying to access yodlee client before initialization',
    });
  }
  return nullthrows(genWaitForLogin).then(() => nullthrows(yodleeClient));
}
