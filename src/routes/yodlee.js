/* @flow */

// import AlgoliaSearch from 'algoliasearch';

import express from 'express';

import { checkAuth } from '../middleware';
import { createJob, genCreateJob } from 'common/lib/models/Job';
import {
  createRefreshInfo,
  createRefreshSchedule,
  genCreateRefreshInfo,
  genFetchRefreshInfoForProvider,
  isInProgress,
  isPendingStatus,
  updateRefreshInfo,
} from 'common/lib/models/YodleeRefreshInfo';
import { DEBUG, INFO } from '../log-utils';
import { genFetchProvider } from 'common/lib/models/YodleeProvider';
import { getYodleeClient, performYodleeUserLogin } from '../yodlee-manager';
import { handleError } from '../route-utils';

import type { ID } from 'common/types/core';
import type { RouteHandler } from '../middleware';
import type { Provider as YodleeProvider } from 'common/lib/models/YodleeProvider';
import type { ProviderFull as RawYodleeProvider } from 'common/types/yodlee';
import type { YodleeRefreshInfo } from 'common/lib/models/YodleeRefreshInfo';

const router = express.Router();

export default router;

// let providerIndex: Object | null = null;

export function initialize(): void {
  // INFO('YODLEE', 'Initializing algolia search');
  // const algolia = AlgoliaSearch(
  //   process.env.ALGOLIA_APP_ID,
  //   process.env.ALGOLIA_API_KEY,
  // );
  // providerIndex = algolia.initIndex('YodleeProviders');
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
    // const index = getProviderIndex();
    const chase = await genFetchProvider('643');
    res.json({
      data: [chase],
    });
    // TODO: I hit a quota. Need to come down from the quota.
    // const result = await index.search({
    //   hitsPerPage: req.query.limit,
    //   page: req.query.page,
    //   query: req.query.query,
    // });
    // res.json({
    //   data: result.hits,
    //   limit: req.query.limit,
    //   page: req.query.offset,
    // });
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
    DEBUG('YODLEE', 'Validating json body of provider payload');
    const provider: RawYodleeProvider = req.body.provider;
    const userID: ID = req.decodedIDToken.uid;
    const refreshInfo = await genFetchRefreshInfoForProvider(
      userID,
      String(provider.id),
    );
    if (
      refreshInfo &&
      (isPendingStatus(refreshInfo) || isInProgress(refreshInfo))
    ) {
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
    DEBUG('YODLEE', 'Attempting to login with provider');
    const provider: YodleeProvider = req.body.provider;
    const yodleeClient = getYodleeClient();
    const yodleeUserSession: string = req.yodleeUserSession;
    DEBUG('YODLEE', 'Sending login to yodlee service');
    const loginPayload = await yodleeClient.genProviderLogin(
      yodleeUserSession,
      provider.raw,
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

    DEBUG('YODLEE', 'Creating / Updating refresh info');
    await genCreateRefreshInfo(refreshInfo);

    INFO('YODLEE', 'Sending refresh job');
    const schedule = createRefreshSchedule(refreshInfo);
    const job = createJob('/update-accounts', { userID }, schedule);
    await genCreateJob(job);

    DEBUG('YODLEE', 'Sending response');
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

// function getProviderIndex(): Object {
//   invariant(
//     providerIndex,
//     'Trying to access providerIndex before routes have been initialized',
//   );
//   return providerIndex;
// }
