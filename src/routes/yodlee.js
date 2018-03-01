/* @flow */

import AlgoliaSearch from 'algoliasearch';

import express from 'express';
import invariant from 'invariant';

import { checkAuth } from '../middleware';
import { createPointer } from 'common/lib/db-utils';
import { DEBUG, INFO } from '../log-utils';
import { genFetchProvider } from 'common/lib/models/Provider';
import {
  genYodleeProviderLink,
  genYodleeProviderLogin,
} from '../operations/provider-link';
import { getYodleeClient, performYodleeUserLogin } from '../yodlee-manager';
import { handleError } from '../route-utils';

import type { ID } from 'common/types/core';
import type { RouteHandler } from '../middleware';
import type { Provider } from 'common/lib/models/Provider';

const router = express.Router();

export default router;

const NULL_STATE_PROVIDER_IDS = [
  '643', // CHASE
  '2852', // BANK OF AMERICA
];

let providerIndex: Object | null = null;

export function initialize(): void {
  INFO('YODLEE', 'Initializing algolia search');
  const algolia = AlgoliaSearch(
    process.env.ALGOLIA_APP_ID,
    process.env.ALGOLIA_API_KEY,
  );
  providerIndex = algolia.initIndex('Providers');
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
    const { limit, page, query } = req.query;

    if (query.trim().length === 0) {
      // Perform null query.
      const providers = await Promise.all(
        NULL_STATE_PROVIDER_IDS.slice(page * limit, limit).map(id =>
          genFetchProvider(id),
        ),
      );
      res.json({
        data: providers,
        page,
        query,
      });
      return;
    }

    const index = getProviderIndex();
    const result = await index.search({
      hitsPerPage: req.query.limit,
      page,
      query,
    });
    res.json({
      data: result.hits,
      limit,
      page,
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

function performProviderLogin(): RouteHandler {
  return handleError(async (req, res) => {
    DEBUG('YODLEE', 'Attempting to login with provider');
    const provider: Provider = req.body.provider;
    const yodleeClient = getYodleeClient();
    const yodleeUserSession: string = req.yodleeUserSession;

    DEBUG('YODLEE', 'Sending login to yodlee service');
    const providerSourceOfTruth = provider.sourceOfTruth;
    invariant(
      providerSourceOfTruth.type === 'YODLEE',
      'Expecting provider to come from YODLEE',
    );
    const yodleeProvider = provider.sourceOfTruth.value;
    const userID: ID = req.decodedIDToken.uid;

    const refreshInfo = await genYodleeProviderLogin(
      yodleeUserSession,
      yodleeClient,
      yodleeProvider,
      userID,
    );
    res.send({
      data: createPointer('RefreshInfo', refreshInfo.id),
    });

    INFO(
      'YODLEE',
      'Refresh info has been sent. Starting post-response linking',
    );
    genYodleeProviderLink(yodleeUserSession, yodleeClient, refreshInfo.id);
  }, true);
}

router.post('/providers/login', checkAuth());
router.post('/providers/login', performYodleeUserLogin());
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
