/* @flow */

import AccountLink from 'common/lib/models/AccountLink';
import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkMutator from 'common/lib/models/AccountLinkMutator';
import AccountLinkOperations from '../operations/account-link';
import AccountLinkTestUtils, {
  TEST_YODLEE_PROVIDER_ID,
} from '../operations/account-link/test-utils';
import Provider from 'common/lib/models/Provider';
import ProviderFetcher from 'common/lib/models/ProviderFetcher';
import UserInfoFetcher from 'common/lib/models/UserInfoFetcher';

import express from 'express';
import invariant from 'invariant';

import { checkAuth } from '../middleware';
import { createPointer } from 'common/lib/db-utils';
import { DEBUG, INFO } from '../log-utils';
import { genProviderAccountMFALogin } from '../yodlee/yodlee-manager';
import { genTestYodleeSubmitMFALoginForm } from '../operations/account-link/create';
import { handleError } from '../route-utils';

import type { ID } from 'common/types/core';
import type {
  LoginForm as YodleeLoginForm,
  ProviderAccount as YodleeProviderAccount,
} from 'common/types/yodlee-v1.0';
import type { RouteHandler } from '../middleware';

const router = express.Router();

export default router;

const PROVIDER_IDS = [
  '643', // CHASE
  '5', // WELLS FARGO
  '12938', // CITI CARDS
  '1603', // CITI BANKING
  '7000', // CAPITAL ONE
  '458', // FIRST REPUBLIC
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
    const userInfo = await UserInfoFetcher.gen(req.decodedIDToken.uid);
    if (!userInfo) {
      const errorCode = 'infindi/server-error';
      const errorMessage = `Logged in with user with no user info: ${
        req.decodedIDToken.uid
      }`;
      const toString = () => `[${errorCode}]: ${errorMessage}`;
      throw { errorCode, errorMessage, toString };
    }

    const { isTestUser } = userInfo;

    if (query.trim().length === 0) {
      const providers = (isTestUser
        ? [AccountLinkTestUtils.createTestProvider()]
        : []
      )
        .concat(getProviders())
        .slice(page * limit, limit);
      res.json({
        data: providers.map(p => p.toRaw()),
        page,
        query,
      });
      return;
    }

    const searchRegExp = new RegExp(query, 'i');
    const providers = (isTestUser
      ? [AccountLinkTestUtils.createTestProvider()]
      : []
    )
      .concat(getProviders())
      .filter(p => searchRegExp.test(p.name))
      .slice(page * limit, limit);

    res.json({
      data: providers.map(p => p.toRaw()),
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

    // STEP 1: Fetch the provider we are logging into.

    const provider =
      providerID === TEST_YODLEE_PROVIDER_ID
        ? await Promise.resolve(AccountLinkTestUtils.createTestProvider())
        : await ProviderFetcher.gen(providerID);
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

    // STEP 2: Fetch the login form for the provider.

    const loginForm: ?YodleeLoginForm = req.body.loginForm;

    if (!loginForm) {
      const errorCode = 'infindi/bad-request';
      const errorMessage = '"loginForm" missing';
      const toString = () => `[${errorCode}]: ${errorMessage}`;
      throw { errorCode, errorMessage, toString };
    }

    // STEP 3: Fetch the account link (or create one if there is none).

    const userID: ID = req.decodedIDToken.uid;
    let accountLink = await AccountLinkFetcher.genForUserAndProvider(
      userID,
      providerID,
    );

    if (!accountLink && providerID === TEST_YODLEE_PROVIDER_ID) {
      accountLink = AccountLinkTestUtils.createTestAccountLink(userID);
      await AccountLinkMutator.genSet(accountLink);
    } else if (!accountLink) {
      const accountLinkSourceOfTruth = { target: 'YODLEE', type: 'EMPTY' };
      accountLink = AccountLink.create(
        accountLinkSourceOfTruth,
        userID,
        providerID,
        provider.name,
      );
      await AccountLinkMutator.genSet(accountLink);
    }

    // STEP 4: Perform the login in the background.

    const linkPayload = { loginForm, type: 'PERFORM_LOGIN' };
    AccountLinkOperations.performLink(
      accountLink.id,
      linkPayload,
      false, // shouldForceLinking
    );
    res.send({ data: createPointer('AccountLink', accountLink.id) });
  }, true);
}

router.post('/providers/:providerID/loginForm', checkAuth());
router.post('/providers/:providerID/loginForm', performProviderLogin());

// -----------------------------------------------------------------------------
//
// POST yodlee/providers/:providerID/mfa
//
// -----------------------------------------------------------------------------

const performProviderMFA = (): RouteHandler =>
  handleError(async (req, res) => {
    // TODO: Need to check if this is a valid provider id.
    const providerID: ID = req.params.providerID;

    const mfaForm: ?YodleeLoginForm = req.body.mfaForm;
    if (!mfaForm) {
      const errorCode = 'infindi/bad-request';
      const errorMessage = '"mfaForm" missing';
      const toString = () => `[${errorCode}]: ${errorMessage}`;
      throw { errorCode, errorMessage, toString };
    }

    const userID: ID = req.decodedIDToken.uid;

    const accountLink = await AccountLinkFetcher.genForUserAndProvider(
      userID,
      providerID,
    );
    if (!accountLink) {
      const errorCode = 'infindi/bad-request';
      const errorMessage = `Expecting account link to exist for provider ${providerID}`;
      const toString = () => `[${errorCode}]: ${errorMessage}`;
      throw { errorCode, errorMessage, toString };
    }

    const providerAccount = getYodleeProviderAccount(accountLink);
    const response =
      providerID === TEST_YODLEE_PROVIDER_ID
        ? await genTestYodleeSubmitMFALoginForm(accountLink.id, mfaForm)
        : await genProviderAccountMFALogin(
            userID,
            String(providerAccount.id),
            mfaForm,
          );

    // Once we have successfully submitted MFA login form, we need to
    // remove the currently cached login form from the account link.
    // NOTE: There is a race condition here. At the time this is called,
    // we are polling for the provider account in the background. It could
    // be the case that in between submitting the MFA login and when this
    // method is called, we get the new MFA login form, in which case, we
    // would then overwrite it with this call, which is very bad. Should
    // find a way around this.
    // await AccountLinkMutator.genSet(
    //   accountLink.setStatus('MFA / WAITING_FOR_LOGIN_FORM'),
    // );

    // TODO: Why is the data the raw yodlee response?
    res.send({ data: response });
  }, true);

router.post('/providers/:providerID/mfaForm', checkAuth());
router.post('/providers/:providerID/mfaForm', performProviderMFA());

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

let _providers: Array<Provider> = [];

async function genSetupProviders(): Promise<void> {
  INFO('YODLEE', 'Setting up providers');
  const allProviders: Array<Provider | null> = await Promise.all(
    PROVIDER_IDS.map(id => ProviderFetcher.gen(id)),
  );
  // $FlowFixMe - This is correct.
  _providers = allProviders.filter(p => p && isProviderSupported(p));
}

function getProviders(): Array<Provider> {
  return _providers;
}

function isProviderSupported(provider: Provider): boolean {
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
