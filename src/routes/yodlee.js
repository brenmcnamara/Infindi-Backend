/* @flow */

import express from 'express';
import invariant from 'invariant';

import { checkAuth } from '../middleware';
import { createPointer } from 'common/lib/db-utils';
import { DEBUG, INFO } from '../log-utils';
import {
  genCreateAccountLink,
  genFetchAccountLinkForProvider,
  updateAccountLinkStatus,
} from 'common/lib/models/AccountLink';
import { genFetchProvider, getProviderName } from 'common/lib/models/Provider';
import { genProviderAccountMFALogin } from '../yodlee-manager';
import {
  genYodleePerformLink,
  genYodleeProviderLogin,
} from '../operations/account-link/create';
import { handleError } from '../route-utils';

import type { AccountLink } from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';
import type {
  LoginForm as YodleeLoginForm,
  ProviderAccount as YodleeProviderAccount,
} from 'common/types/yodlee';
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
// POST yodlee/providers/:providerID/loginForm
//
// -----------------------------------------------------------------------------

function performProviderLogin(): RouteHandler {
  return handleError(async (req, res) => {
    DEBUG('YODLEE', 'Attempting to login with provider');
    const providerID: ID = req.params.providerID;

    const provider = await genFetchProvider(providerID);
    if (!provider) {
      const errorCode = 'infindi/bad-request';
      const errorMessage = `Provider ${providerID} does not exist`;
      const toString = () => `[${errorCode}]: ${errorMessage}`;
      throw { errorCode, errorMessage, toString };
    }

    if (provider.sourceOfTruth.type !== 'YODLEE') {
      const errorCode = 'infindi/bad-request';
      const errorMessage = `Provider ${providerID} must come from YODLEE`;
      const toString = () => `[${errorCode}]: ${errorMessage}`;
      throw { errorCode, errorMessage, toString };
    }
    const yodleeProvider = provider.sourceOfTruth.value;

    const loginForm: YodleeLoginForm = req.body.loginForm;

    if (!loginForm) {
      const errorCode = 'infindi/bad-request';
      const errorMessage = '"loginForm" missing';
      const toString = () => `[${errorCode}]: ${errorMessage}`;
      throw { errorCode, errorMessage, toString };
    }

    switch (loginForm.formType) {
      case 'login': {
        const userID: ID = req.decodedIDToken.uid;
        const accountLink = await genYodleeProviderLogin(userID, {
          ...yodleeProvider,
          loginForm,
        });
        res.send({ data: createPointer('AccountLink', accountLink.id) });

        INFO(
          'YODLEE',
          'Refresh info has been sent. Starting post-response linking',
        );
        genYodleePerformLink(accountLink.id);
        break;
      }

      case 'questionAndAnswer':
      case 'token': {
        const userID: ID = req.decodedIDToken.uid;
        const accountLink = await genFetchAccountLinkForProvider(
          userID,
          providerID,
        );
        if (!accountLink) {
          const errorCode = 'infindi/bad-request';
          const errorMessage = `Expecting account link to exist for provider ${
            providerID
          }`;
          const toString = () => `[${errorCode}]: ${errorMessage}`;
          throw { errorCode, errorMessage, toString };
        }
        const providerAccount = getYodleeProviderAccount(accountLink);
        const response = await genProviderAccountMFALogin(
          userID,
          String(providerAccount.id),
          loginForm,
        );
        // Once we have successfully submitted MFA login form, we need to
        // remove the currently cached login form from the account link.
        // NOTE: There is a race condition here. At the time this is called,
        // we are polling for the provider account in the background. It could
        // be the case that in between submitting the MFA login and when this
        // method is called, we get the new MFA login form, in which case, we
        // would then overwrite it with this call, which is very bad. Should
        // find a way around this.
        await genCreateAccountLink(
          updateAccountLinkStatus(accountLink, 'MFA / WAITING_FOR_LOGIN_FORM'),
        );
        res.send({ data: response });
        break;
      }

      default: {
        const errorCode = 'infindi/server-error';
        const errorMessage = `Cannot handle login forms of type ${
          loginForm.formType
        }`;
        const toString = () => `[${errorCode}]: ${errorMessage}`;
        throw { errorCode, errorMessage, toString };
      }
    }
  }, true);
}

router.post('/providers/:providerID/loginForm', checkAuth());
router.post('/providers/:providerID/loginForm', performProviderLogin());

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
    provider.sourceOfTruth.value.authType === 'CREDENTIALS' ||
    provider.sourceOfTruth.value.authType === 'MFA_CREDENTIALS'
  );
}

function getYodleeProviderAccount(
  accountLink: AccountLink,
): YodleeProviderAccount {
  invariant(
    accountLink.sourceOfTruth.type === 'YODLEE',
    'Expecting account link to come from YODLEE',
  );
  return accountLink.sourceOfTruth.providerAccount;
}
