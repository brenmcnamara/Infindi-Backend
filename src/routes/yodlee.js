/* @flow */

import AccountLink from 'common/lib/models/AccountLink';
import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkMutator from 'common/lib/models/AccountLinkMutator';
import AccountLinkOperations from '../operations/account-link';
import AccountLinkTestUtils, {
  TEST_YODLEE_PROVIDER_ID,
} from '../operations/account-link/test-utils';
import ProviderFetcher from 'common/lib/models/ProviderFetcher';

import express from 'express';
import invariant from 'invariant';

import { checkAuth } from '../middleware';
import { createPointer } from 'common/lib/db-utils';
import { DEBUG } from '../log-utils';
import { genProviderAccountMFALogin } from '../yodlee/yodlee-manager';
import { handleError } from '../route-utils';

import type { ID } from 'common/types/core';
import type {
  LoginForm as YodleeLoginForm,
  ProviderAccount as YodleeProviderAccount,
} from 'common/types/yodlee-v1.0';
import type { RouteHandler } from '../middleware';

const router = express.Router();

export default router;

export function initialize(): void {}

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
    if (providerID === TEST_YODLEE_PROVIDER_ID) {
      await AccountLinkTestUtils.genTestMFALogin(accountLink.id, mfaForm);
    } else {
      await genProviderAccountMFALogin(
        userID,
        String(providerAccount.id),
        mfaForm,
      );
    }

    res.send({ data: createPointer('AccountLink', accountLink.id) });
  }, true);

router.post('/providers/:providerID/mfaForm', checkAuth());
router.post('/providers/:providerID/mfaForm', performProviderMFA());

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function getYodleeProviderAccount(
  accountLink: AccountLink,
): YodleeProviderAccount {
  invariant(
    accountLink.sourceOfTruth.type === 'YODLEE',
    'Expecting account link to come from YODLEE',
  );
  return accountLink.sourceOfTruth.providerAccount;
}
