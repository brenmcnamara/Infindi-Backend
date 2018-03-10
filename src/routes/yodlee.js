/* @flow */

import express from 'express';
import invariant from 'invariant';

import { checkAuth } from '../middleware';
import { createPointer } from 'common/lib/db-utils';
import { DEBUG, INFO } from '../log-utils';
import { genFetchProvider, getProviderName } from 'common/lib/models/Provider';
import {
  genYodleePerformLink,
  genYodleeProviderLogin,
} from '../operations/account-link-create';
import { getYodleeClient, performYodleeUserLogin } from '../yodlee-manager';
import { handleError } from '../route-utils';

import type { ID } from 'common/types/core';
import type { RouteHandler } from '../middleware';
import type { Provider } from 'common/lib/models/Provider';

const router = express.Router();

export default router;

const PROVIDER_IDS = [
  '643', // CHASE
  '5', // WELLS FARGO
  '12938', // CITI CARDS
  '17781', // CITI BANKING
  '7000', // CAPITAL ONE
  '20719', // MORGAN STANLEY
  '10710', // DISCOVER
  '12171', // LENDING CLUB
  '12', // AMERICAN EXPRESS
  '10017', // BARCLAYCARD US
  '98', // Vanguard
  '2852', // Bank of America
  '21', // Charles Schwab
  '15052', // Technology Credit Union
  '13843', // Optum Bank
  '2162', // PNC Bank
  '3278', // USAA
  '492', // FIDELITY
  '291', // TD Ameritrade
  '18061', // GS Bank / Marcus
  '9565', // Ally Bank
  '2383', // SunTrust Bank
  '4132', // TD BANK
  '19632', // Navient
  '3589', // Sallie Mae
  '9749', // Prosper
  '12944', // LightStream
  '13960', // HSBC USA
  '3531', // Paypal
];

export function initialize(): void {
  genSetupProviders();
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
      const providers = getProviders().slice(page * limit, limit);
      res.json({
        data: providers,
        page,
        query,
      });
      return;
    }

    const searchRegExp = new RegExp(query, 'i');
    const providers = getProviders()
      .filter(p => searchRegExp.test(getProviderName(p)))
      .slice(page * limit, limit);
    res.json({
      data: providers,
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
    genYodleePerformLink(yodleeUserSession, yodleeClient, refreshInfo.id);
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

let _providers: Array<Provider> = [];

async function genSetupProviders(): Promise<void> {
  INFO('YODLEE', 'Setting up providers');
  const allProviders: Array<Provider | null> = await Promise.all(
    PROVIDER_IDS.map(id => genFetchProvider(id)),
  );
  // $FlowFixMe - This is correct.
  _providers = allProviders.filter(p => p && isProviderSupported(p));
}

function getProviders(): Array<Provider> {
  return _providers;
}

function isProviderSupported(provider: Provider): bool {
  if (provider.quirkCount > 0) {
    return false;
  }
  return (
    provider.sourceOfTruth.type !== 'YODLEE' ||
    provider.sourceOfTruth.value.authType === 'CREDENTIALS'
  );
}
