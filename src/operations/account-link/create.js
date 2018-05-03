/* @flow */

import Logger from './logger';

import invariant from 'invariant';

import {
  createAccountLinkYodlee,
  genCreateAccountLink,
  genFetchAccountLink,
  genFetchAccountLinkForProvider,
  isInMFA,
  isLinking,
  isLinkFailure,
  isLinkSuccess,
  updateAccountLinkStatus,
  updateAccountLinkYodlee,
} from 'common/lib/models/AccountLink';
import { genProviderAccount, genProviderLogin } from '../../yodlee/yodlee-manager';
import { genUpdateLink, genYodleeLinkPass, handleLinkingError } from './utils';
import { INFO } from '../../log-utils';

import type {
  AccountLink,
  AccountLinkStatus,
} from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';
import type {
  LoginForm as YodleeLoginForm,
  ProviderAccount as YodleeProviderAccount,
  ProviderFull as YodleeProvider,
} from 'common/types/yodlee-v1.0';

export async function genYodleeProviderLogin(
  userID: ID,
  yodleeProvider: YodleeProvider,
): Promise<AccountLink> {
  INFO('ACCOUNT-LINK', 'Linking yodlee account');

  const loginPayload = await genProviderLogin(userID, yodleeProvider);
  const providerID = String(yodleeProvider.id);
  const providerName = yodleeProvider.name;
  const providerAccountID = String(loginPayload.providerAccountId);
  const yodleeProviderAccount = await genProviderAccount(
    userID,
    providerAccountID,
  );
  invariant(
    yodleeProviderAccount,
    'Expecting yodlee provider account to exist after login attempt',
  );

  INFO(
    'ACCOUNT-LINK',
    `Checking if account link for provider ${providerID} already exists`,
  );
  const existingAccountLink = await genFetchAccountLinkForProvider(
    userID,
    providerID,
  );
  if (existingAccountLink && isLinking(existingAccountLink)) {
    // TODO: This should not have to know about requests.
    throw {
      errorCode: 'infindi/bad-request',
      errorMessage: 'Cannot link accounts that are already being linked',
    };
  }

  INFO(
    'ACCOUNT-LINK',
    existingAccountLink
      ? `Found existing account link for provider ${providerID}`
      : `No account link found for provider ${providerID}`,
  );
  const accountLink: AccountLink = existingAccountLink
    ? updateAccountLinkYodlee(existingAccountLink, yodleeProviderAccount)
    : createAccountLinkYodlee(
        yodleeProviderAccount,
        userID,
        providerID,
        providerName,
      );

  INFO('ACCOUNT-LINK', 'Creating / Updating refresh info');
  await genCreateAccountLink(accountLink);
  return accountLink;
}

export async function genYodleePerformLink(accountLinkID: ID): Promise<void> {
  await handleLinkingError(accountLinkID, () =>
    genYodleePerformLinkImpl(accountLinkID),
  );
}

async function genYodleePerformLinkImpl(accountLinkID: ID): Promise<void> {
  INFO('ACCOUNT-LINK', `Performing link with account link ${accountLinkID}`);
  let accountLink = await genFetchAccountLink(accountLinkID);

  if (!accountLink) {
    // TODO: Move these types of errors to the request logic. This should be
    // agnostic to the caller.
    throw {
      errorCode: 'infindi/server-error',
      errorMessage: 'Trying to wait for non-existent account link',
    };
  }
  Logger.genStart(accountLink, 'MANUAL');

  const userID = accountLink.userRef.refID;
  INFO(
    'ACCOUNT-LINK',
    'Checking yodlee provider for completed linking attempt',
  );
  let newAccountLink = await genYodleeLinkPass(userID, accountLinkID);
  const sleepTime = 4000;
  while (isLinking(newAccountLink) || isInMFA(newAccountLink)) {
    await sleepForMillis(sleepTime);
    newAccountLink = await genYodleeLinkPass(userID, accountLinkID);
    Logger.genUpdate(newAccountLink);
  }

  INFO('ACCOUNT-LINK', 'Yodlee has completed linking attempt');
  invariant(
    accountLink,
    'Expecting account link to exist after linking is complete',
  );
  invariant(
    !isLinking(newAccountLink),
    'Expecting account link to be finished linking',
  );

  if (isLinkFailure(newAccountLink)) {
    INFO(
      'ACCOUNT-LINK',
      `Yodlee linking failed. Check account link for more info: ${
        accountLink.id
      }`,
    );
    return;
  }

  invariant(
    isLinkSuccess(newAccountLink),
    'Refresh info is in unknown state. Please check refresh for more info: %s',
    accountLink.id,
  );

  // Perform the linking + update here.
  await genUpdateLink(newAccountLink);
  Logger.genStop(newAccountLink);
  INFO('ACCOUNT-LINK', 'Finished downloading account link data');
}

export async function genTestYodleeProviderLogin(
  userID: ID,
  yodleeProvider: YodleeProvider,
): Promise<AccountLink> {
  await sleepForMillis(3000);

  // STEP 1: IN_PROGRESS / VERIFYING_CREDENTIALS
  const providerID = String(yodleeProvider.id);
  const providerName = yodleeProvider.name;

  let accountLink = await genFetchAccountLinkForProvider(userID, providerID);

  accountLink = accountLink
    ? updateAccountLinkStatus(
        accountLink,
        'IN_PROGRESS / VERIFYING_CREDENTIALS',
      )
    : createAccountLinkYodlee(
        createTestYodleeProviderAccount(yodleeProvider.id),
        userID,
        providerID,
        providerName,
      );

  await genCreateAccountLink(accountLink);
  return accountLink;
}

export async function genTestYodleeSubmitMFALoginForm(
  accountLinkID: ID,
  loginForm: YodleeLoginForm,
): Promise<void> {
  let accountLink = await genFetchAccountLink(accountLinkID);
  const isCorrect =
    loginForm.row[0].field[0].value === '4' ||
    loginForm.row[0].field[0].value === '8';

  if (!accountLink) {
    const errorCode = 'infindi/server-error';
    const errorMessage = 'Trying to get test account link that does not exist';
    const toString = `[${errorCode}]: ${errorMessage}`;
    throw { errorCode, errorMessage, toString };
  }

  const yodleeProviderIDAsLong = parseInt(accountLink.providerRef.refID, 10);
  invariant(
    !Number.isNaN(yodleeProviderIDAsLong),
    'Expecting yodlee provider id to be a long in string form',
  );

  await sleepForMillis(4000);

  if (!isCorrect) {
    accountLink = updateAccountLinkStatus(
      accountLink,
      'FAILURE / BAD_CREDENTIALS',
    );
    await genCreateAccountLink(accountLink);
    return;
  }

  const yodleeProviderAccount = {
    ...createTestYodleeProviderAccount(yodleeProviderIDAsLong),
    refreshInfo: {
      lastRefreshed: '2018-04-01T00:00:00Z',
      lastRefreshAttempt: '2018-04-01T00:00:00Z',
      statusCode: 0,
      status: 'IN_PROGRESS',
      statusMessage: 'blah',
    },
  };
  accountLink = updateAccountLinkYodlee(accountLink, yodleeProviderAccount);
  await genCreateAccountLink(accountLink);
}

export async function genTestYodleePerformLink(
  accountLinkID: ID,
  desiredStatus: AccountLinkStatus,
  loginFormCount: '0' | '1' | '2',
): Promise<void> {
  let accountLink = await genFetchAccountLink(accountLinkID);

  if (!accountLink) {
    const errorCode = 'infindi/server-error';
    const errorMessage = 'Trying to get test account link that does not exist';
    const toString = `[${errorCode}]: ${errorMessage}`;
    throw { errorCode, errorMessage, toString };
  }

  await sleepForMillis(3000);

  // STEP 2: FAILURE / BAD_CREDENTIALS
  if (desiredStatus === 'FAILURE / BAD_CREDENTIALS') {
    accountLink = updateAccountLinkStatus(
      accountLink,
      'FAILURE / BAD_CREDENTIALS',
    );
    await genCreateAccountLink(accountLink);
    return;
  }

  // STEP 3: MFA
  if (loginFormCount !== '0') {
    invariant(
      accountLink.sourceOfTruth.type === 'YODLEE',
      'Expecting account link to come from YODLEE',
    );
    const prevProviderAccount = accountLink.sourceOfTruth.providerAccount;

    // FORM 1
    let providerAccount = {
      ...prevProviderAccount,
      loginForm: createTestYodleeMFALoginForm('1'),
      refreshInfo: {
        ...prevProviderAccount.refreshInfo,
        additionalStatus: 'USER_INPUT_REQUIRED',
      },
    };
    accountLink = updateAccountLinkYodlee(accountLink, providerAccount);
    await genCreateAccountLink(accountLink);

    // Loop until we are no longer in MFA login, or if there is no feedback
    // for a long enough time.
    let remainingLoops = 5;

    while (
      remainingLoops > 0 &&
      accountLink.status === 'MFA / PENDING_USER_INPUT'
    ) {
      await sleepForMillis(3000);

      accountLink = await genFetchAccountLink(accountLinkID);
      invariant(
        accountLink,
        'Expecting account link to exist: %s',
        accountLinkID,
      );
      --remainingLoops;
    }

    if (accountLink.status === 'MFA / PENDING_USER_INPUT') {
      // Never completed MFA. Force fail.
      accountLink = updateAccountLinkStatus(
        accountLink,
        'FAILURE / MFA_FAILURE',
      );
      await genCreateAccountLink(accountLink);
      return;
    }

    // FORM 2
    if (loginFormCount === '2') {
      providerAccount = {
        ...providerAccount,
        loginForm: createTestYodleeMFALoginForm('2'),
        refreshInfo: {
          ...providerAccount.refreshInfo,
          additionalStatus: 'USER_INPUT_REQUIRED',
        },
      };
      accountLink = updateAccountLinkYodlee(accountLink, providerAccount);
      await genCreateAccountLink(accountLink);

      remainingLoops = 5;
      while (
        remainingLoops > 0 &&
        accountLink.status === 'MFA / PENDING_USER_INPUT'
      ) {
        await sleepForMillis(3000);

        accountLink = await genFetchAccountLink(accountLinkID);
        invariant(
          accountLink,
          'Expecting account link to exist: %s',
          accountLinkID,
        );
        --remainingLoops;
      }
    }
  }

  // STEP 4: IN_PROGRESS / DOWNLOADING_DATA
  if (loginFormCount === '0') {
    // The MFA login will enter this state for us.
    accountLink = updateAccountLinkStatus(
      accountLink,
      'IN_PROGRESS / DOWNLOADING_DATA',
    );
    await genCreateAccountLink(accountLink);
  }
  await sleepForMillis(8000);

  // STEP 5: desired status.
  accountLink = updateAccountLinkStatus(accountLink, desiredStatus);
  await genCreateAccountLink(accountLink);
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function createTestYodleeMFALoginForm(formVersion: '1' | '2'): YodleeLoginForm {
  return {
    formType: 'questionAndAnswer',
    mfaInfoText: formVersion === '1' ? 'Quick MFA Login Test' : 'Follow Up',
    mfaInfoTitle: 'Test Properties',
    mfaTimeout: 90000,
    row: [
      {
        id: 'Row 1',
        label: formVersion === '1' ? 'What is 2 + 2?' : 'What is 4 + 4?',
        fieldRowChoice: '',
        form: '',
        field: [
          {
            id: 'field 1',
            isOptional: false,
            name: 'testCondition',
            option: [
              {
                displayText: formVersion === '1' ? '4' : '8',
                isSelected: 'false',
                optionValue: formVersion === '1' ? '4' : '8',
              },
              {
                displayText: formVersion === '1' ? 'Not 4' : 'Not 8',
                isSelected: 'false',
                optionValue: formVersion === '1' ? 'Not 4' : 'Not 8',
              },
            ],
            type: 'option',
            value: '',
            valueEditable: 'true',
          },
        ],
      },
    ],
  };
}

// Creates a test yodlee provider account that has a status indicating it is
// currently logging in.
function createTestYodleeProviderAccount(
  yodleeProviderIDAsLong: number,
): YodleeProviderAccount {
  return {
    aggregationSource: 'SYSTEM',
    createdDate: '2018-04-01',
    id: 0,
    isManual: false,
    lastUpdated: '2018-04-01T00:00:00Z',
    providerId: yodleeProviderIDAsLong,
    refreshInfo: {
      additionalStatus: 'LOGIN_IN_PROGRESS',
      lastRefreshed: '2018-04-01T00:00:00Z',
      lastRefreshAttempt: '2018-04-01T00:00:00Z',
      statusCode: 0,
      status: 'IN_PROGRESS',
      statusMessage: 'blah',
    },
  };
}

function sleepForMillis(millis: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
}
