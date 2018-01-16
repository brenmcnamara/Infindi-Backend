/* @flow */

// import * as FirebaseAdmin from 'firebase-admin';
import AlgoliaSearch from 'algoliasearch';
// import Common from 'common';
// import CommonBackend from 'common-backend';

import express from 'express';
import invariant from 'invariant';

import { checkAuth } from '../middleware';
// import { DEBUG, ERROR, INFO } from '../log-utils';
import { handleError } from '../route-utils';

// import type { ID } from 'common/types/core';
import type { RouteHandler } from '../middleware';

const router = express.Router();

export default router;

let providerIndex: Object | null = null;

export function initialize(): void {
  const algolia = AlgoliaSearch(
    process.env.ALGOLIA_APP_ID,
    process.env.ALGOLIA_API_KEY,
  );
  providerIndex = algolia.initIndex('YodleeProviders');
}

// -----------------------------------------------------------------------------
//
// GET yodlee/provider/search?limit=<n>&page=<n>&query=<s>
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

router.get('/provider/search', checkAuth());
router.get('/provider/search', validateProviderSearch());
router.get('/provider/search', performProviderSearch());

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
