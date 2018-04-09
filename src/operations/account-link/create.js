/* @flow */

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
import { genProviderAccount, genProviderLogin } from '../../yodlee-manager';
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
} from 'common/types/yodlee';

export async function genYodleeProviderLogin(
  userID: ID,
  yodleeProvider: YodleeProvider,
): Promise<AccountLink> {
  INFO('ACCOUNT-LINK', 'Linking yodlee account');

  const loginPayload = await genProviderLogin(userID, yodleeProvider);
  const providerID = String(yodleeProvider.id);
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
    : createAccountLinkYodlee(yodleeProviderAccount, userID, providerID);

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

  const userID = accountLink.userRef.refID;
  INFO(
    'ACCOUNT-LINK',
    'Checking yodlee provider for completed linking attempt',
  );
  let newAccountLink = await genYodleeLinkPass(userID, accountLinkID);
  const sleepTime = 3000;
  while (isLinking(newAccountLink) || isInMFA(newAccountLink)) {
    await sleepForMillis(sleepTime);
    newAccountLink = await genYodleeLinkPass(userID, accountLinkID);
  }

  INFO('ACCOUNT-LINK', 'Yodlee has completed linking attempt');
  invariant(
    accountLink && !isLinking(accountLink),
    'Expecting account link to exist after linking is complete',
  );

  if (isLinkFailure(accountLink)) {
    INFO(
      'ACCOUNT-LINK',
      `Yodlee linking failed. Check account link for more info: ${
        accountLink.id
      }`,
    );
    return;
  }

  invariant(
    isLinkSuccess(accountLink),
    'Refresh info is in unknown state. Please check refresh for more info: %s',
    accountLink.id,
  );

  // Perform the linking + update here.
  await genUpdateLink(accountLink);
  INFO('ACCOUNT-LINK', 'Finished downloading account link data');
}

export async function genTestYodleeProviderLogin(
  userID: ID,
  yodleeProvider: YodleeProvider,
): Promise<AccountLink> {
  await sleepForMillis(3000);

  // STEP 1: IN_PROGRESS / VERIFYING_CREDENTIALS

  let accountLink = await genFetchAccountLinkForProvider(
    userID,
    String(yodleeProvider.id),
  );

  accountLink = accountLink
    ? updateAccountLinkStatus(
        accountLink,
        'IN_PROGRESS / VERIFYING_CREDENTIALS',
      )
    : createAccountLinkYodlee(
        createTestYodleeProviderAccount(yodleeProvider.id),
        userID,
        String(yodleeProvider.id),
      );

  await genCreateAccountLink(accountLink);
  return accountLink;
}

export async function genTestYodleeSubmitMFALoginForm(
  accountLinkID: ID,
  loginForm: YodleeLoginForm,
): Promise<void> {
  let accountLink = await genFetchAccountLink(accountLinkID);
  const isCorrect = loginForm.row[0].field[0].value === '4';

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
  shouldUseMFA: boolean,
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
  if (shouldUseMFA) {
    invariant(
      accountLink.sourceOfTruth.type === 'YODLEE',
      'Expecting account link to come from YODLEE',
    );
    const prevProviderAccount = accountLink.sourceOfTruth.providerAccount;
    // MFA is not yet supported.
    const providerAccount = {
      ...prevProviderAccount,
      loginForm: createTestYodleeMFALoginForm(),
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
      accountLink.status !== 'IN_PROGRESS / DOWNLOADING_DATA'
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

    if (accountLink.status !== 'IN_PROGRESS / DOWNLOADING_DATA') {
      // Never completed MFA. Force fail.
      accountLink = updateAccountLinkStatus(
        accountLink,
        'FAILURE / MFA_FAILURE',
      );
      await genCreateAccountLink(accountLink);
      return;
    }
  }

  // STEP 4: IN_PROGRESS / DOWNLOADING_DATA
  if (!shouldUseMFA) {
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

function createTestYodleeMFALoginForm(): YodleeLoginForm {
  return {
    formType: 'questionAndAnswer',
    mfaInfoText: 'Quick MFA Login Test',
    mfaInfoTitle: 'Test Properties',
    mfaTimeout: 90000,
    row: [
      {
        id: 'Row 1',
        label: 'What is 2 + 2?',
        fieldRowChoice: '',
        form: '',
        field: [
          {
            id: 'field 1',
            isOptional: false,
            name: 'testCondition',
            option: [
              {
                displayText: '4',
                isSelected: 'false',
                optionValue: '4',
              },
              {
                displayText: 'Not 4',
                isSelected: 'false',
                optionValue: 'Not 4',
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
