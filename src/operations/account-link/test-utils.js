/* @flow */

import AccountLink from 'common/lib/models/AccountLink';
import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkMutator from 'common/lib/models/AccountLinkMutator';
import Provider from 'common/lib/models/Provider';

import invariant from 'invariant';

import { INFO } from '../../log-utils';

import type { AccountLinkStatus } from 'common/lib/models/AccountLink';
import type { ID } from 'common/types/core';
import type { LinkPayload } from './state-machine/LinkStateMachine';
import type {
  LoginForm as YodleeLoginForm,
  ProviderAccount as YodleeProviderAccount,
  ProviderFull as YodleeProvider,
} from 'common/types/yodlee-v1.0';

export const TEST_YODLEE_PROVIDER_ID = '0';
export const TEST_YODLEE_PROVIDER_ID_AS_LONG = 0;

const SUPPORTED_TEST_ACCOUNT_LINK_STATUSES = [
  'SUCCESS',
  'FAILURE / BAD_CREDENTIALS',
  'FAILURE / INTERNAL_SERVICE_FAILURE',
  'FAILURE / EXTERNAL_SERVICE_FAILURE',
];

// -----------------------------------------------------------------------------
//
// BUILDERS
//
// -----------------------------------------------------------------------------

function createTestAccountLink(userID: ID): AccountLink {
  const sourceOfTruth = { target: 'YODLEE', type: 'EMPTY' };
  const provider = createTestProvider();

  // NOTE: Need to tweak the id of the test account link.
  const accountLink = AccountLink.create(
    sourceOfTruth,
    userID,
    provider.id,
    provider.name,
  );
  return AccountLink.fromRaw({
    ...accountLink.toRaw(),
    id: `TESTING_${accountLink.id}`,
  });
}

function createTestProvider(): Provider {
  const now = new Date();
  const initialLoginForm: YodleeLoginForm = {
    formType: 'questionAndAnswer',
    mfaInfoText: 'Configure the test login',
    mfaInfoTitle: 'Test Properties',
    mfaTimeout: 90000,
    row: [
      {
        id: 'Row 1',
        label: 'What condition are you testing?',
        fieldRowChoice: '',
        form: '',
        field: [
          {
            id: 'field 1',
            isOptional: false,
            name: 'testCondition',
            option: SUPPORTED_TEST_ACCOUNT_LINK_STATUSES.map(status => ({
              displayText: status,
              isSelected: 'false',
              optionValue: status,
            })),
            type: 'option',
            value: '',
            valueEditable: 'true',
          },
        ],
      },
      {
        id: 'Row 2',
        label: 'How many MFA steps should there be?',
        fieldRowChoice: '',
        form: '',
        field: [
          {
            id: 'field 2',
            isOptional: false,
            name: 'includeMFA',
            option: [
              {
                displayText: '0',
                isSelected: 'false',
                optionValue: '0',
              },
              {
                displayText: '1',
                isSelected: 'false',
                optionValue: '1',
              },
              {
                displayText: '2',
                isSelected: 'false',
                optionValue: '2',
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

  const yodleeProvider: YodleeProvider = {
    additionalDataSet: [],
    authType: 'MFA_CREDENTIALS',
    baseUrl: 'https://www.chase.com/',
    capability: [],
    containerAttributes: {},
    containerNames: [],
    countryISOCode: 'US',
    favicon: 'https://yodlee-1.hs.llnwd.net/v1/FAVICON/FAV_643.PNG',
    id: 0,
    isAutoRefreshEnabled: true,
    languageISOCode: 'EN',
    lastModified: '2018-02-05T12:29:48Z',
    loginForm: initialLoginForm,
    loginUrl: 'https://chaseonline.chase.com/Logon.aspx?LOB=Yodlee',
    logo: 'https://yodlee-1.hs.llnwd.net/v1/LOGO/LOGO_643_1_1.PNG',
    name: 'Test Login',
    oAuthSite: false,
    primaryLanguageISOCode: 'EN',
    status: 'Supported',
  };

  const raw = {
    createdAt: now,
    id: TEST_YODLEE_PROVIDER_ID,
    isDeprecated: false,
    modelType: 'Provider',
    sourceOfTruth: {
      type: 'YODLEE',
      value: yodleeProvider,
    },
    quirkCount: 0,
    quirks: [],
    type: 'MODEL',
    updatedAt: now,
  };

  return Provider.fromRaw(raw);
}

function createTestYodleeMFALoginForm(
  formVersion: 'MFA_1' | 'MFA_2',
): YodleeLoginForm {
  return {
    formType: 'questionAndAnswer',
    mfaInfoText: formVersion === 'MFA_1' ? 'Quick MFA Login Test' : 'Follow Up',
    mfaInfoTitle: 'Test Properties',
    mfaTimeout: 90000,
    row: [
      {
        id: 'Row 1',
        label: formVersion === 'MFA_1' ? 'What is 2 + 2?' : 'What is 4 + 4?',
        fieldRowChoice: '',
        form: '',
        field: [
          {
            id: 'field 1',
            isOptional: false,
            name: 'testCondition',
            option: [
              {
                displayText: formVersion === 'MFA_1' ? '4' : '8',
                isSelected: 'false',
                optionValue: formVersion === 'MFA_1' ? '4' : '8',
              },
              {
                displayText: formVersion === 'MFA_1' ? 'Not 4' : 'Not 8',
                isSelected: 'false',
                optionValue: formVersion === 'MFA_1' ? 'Not 4' : 'Not 8',
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
  formVersion: 'NO_FORM' | 'MFA_1' | 'MFA_2',
): YodleeProviderAccount {
  let loginFormContainer;
  let additionalStatusContainer;
  switch (formVersion) {
    case 'NO_FORM': {
      loginFormContainer = {};
      additionalStatusContainer = {};
      break;
    }

    case 'MFA_1':
    case 'MFA_2': {
      loginFormContainer = {
        loginForm: createTestYodleeMFALoginForm(formVersion),
      };
      additionalStatusContainer = {
        additionalStatus: 'USER_INPUT_REQUIRED',
      };
      break;
    }

    default:
      invariant(false, 'Unrecognized test form version: %s', formVersion);
  }

  // $FlowFixMe - I'm using a spread. Deal with it, flow.
  return {
    ...loginFormContainer,
    aggregationSource: 'SYSTEM',
    createdDate: '2018-04-01',
    id: 0,
    isManual: false,
    lastUpdated: '2018-04-01T00:00:00Z',
    providerId: TEST_YODLEE_PROVIDER_ID_AS_LONG,
    refreshInfo: {
      ...additionalStatusContainer,
      lastRefreshed: '2018-04-01T00:00:00Z',
      lastRefreshAttempt: '2018-04-01T00:00:00Z',
      statusCode: 0,
      status: 'IN_PROGRESS',
      statusMessage: 'blah',
    },
  };
}

// -----------------------------------------------------------------------------
//
// PERFORM MFA LOGIN
//
// -----------------------------------------------------------------------------

// NOTE: Need to simulate submitting the login form then validating it in
// the background.
function genTestMFALogin(
  accountLinkID: ID,
  mfaForm: YodleeLoginForm,
): Promise<void> {
  genPerformTestMFALogin(accountLinkID, mfaForm);
  return Promise.resolve();
}

async function genPerformTestMFALogin(
  accountLinkID: ID,
  mfaForm: YodleeLoginForm,
): Promise<void> {
  await sleepForMillis(4000);

  const didPass = getDidPassMFAForMFAForm(mfaForm);

  const status = didPass
    ? 'IN_PROGRESS / DOWNLOADING_DATA'
    : 'FAILURE / BAD_CREDENTIALS';

  const accountLink = await AccountLinkFetcher.genNullthrows(accountLinkID);

  INFO('ACCOUNT-LINK', `Test link: ${status}`);
  await AccountLinkMutator.genSet(
    accountLink
      .setYodlee(createTestYodleeProviderAccount('NO_FORM'))
      .setStatus(status),
  );
}

// -----------------------------------------------------------------------------
//
// TEST LOGIN
//
// -----------------------------------------------------------------------------

async function genTestPerformLink(
  accountLinkID: ID,
  payload: LinkPayload,
): Promise<void> {
  INFO('ACCOUNT-LINK', 'Performing test login');

  invariant(
    payload.type === 'PERFORM_LOGIN',
    'Test linking only supports login payloads',
  );
  const { loginForm } = payload;

  let accountLink = await AccountLinkFetcher.genNullthrows(accountLinkID);

  INFO('ACCOUNT-LINK', 'Test link: INITIALIZING');
  accountLink = accountLink
    .setYodlee(createTestYodleeProviderAccount('NO_FORM'))
    .setStatus('IN_PROGRESS / INITIALIZING');
  await AccountLinkMutator.genSet(accountLink);

  await sleepForMillis(3000);

  INFO('ACCOUNT-LINK', 'Test link: VERIFYING_CREDENTIALS');
  accountLink = accountLink.setStatus('IN_PROGRESS / VERIFYING_CREDENTIALS');
  await AccountLinkMutator.genSet(accountLink);

  // ---------------------------------------------------------------------------
  // MFA SECTION STARTS
  // ---------------------------------------------------------------------------

  await sleepForMillis(3000);

  const shouldTestMFA = getShouldUseMFAForLoginForm(loginForm);

  if (shouldTestMFA) {
    INFO('ACCOUNT-LINK', 'Test link: MFA / WAITING_FOR_LOGIN_FORM');
    accountLink = accountLink.setStatus('MFA / WAITING_FOR_LOGIN_FORM');
    await AccountLinkMutator.genSet(accountLink);

    await sleepForMillis(3000);

    INFO('ACCOUNT-LINK', 'Test link: MFA / PENDING_USER_INPUT');
    accountLink = accountLink
      .setYodlee(createTestYodleeProviderAccount('MFA_1'))
      .setStatus('MFA / PENDING_USER_INPUT');
    await AccountLinkMutator.genSet(accountLink);
  }

  let retryCount = 5;
  while (accountLink.isInMFA && retryCount >= 0) {
    await sleepForMillis(3000);
    accountLink = await AccountLinkFetcher.genNullthrows(accountLinkID);
    --retryCount;
  }

  if (retryCount < 0) {
    INFO('ACCOUNT-LINK', 'Test link: FAILURE / TIMEOUT');
    accountLink = accountLink.setStatus('FAILURE / TIMEOUT');
    await AccountLinkMutator.genSet(accountLink);
    return;
  }

  // Another process sets the status to get out of MFA. Need to check if it
  // sets to a non-linking status (most likely an MFA failure).
  if (!accountLink.isLinking) {
    return;
  }

  // ---------------------------------------------------------------------------
  // MFA SECTION ENDS
  // ---------------------------------------------------------------------------

  // In MFA testing, another process is in charge of setting the status to
  // downloading.
  if (!shouldTestMFA) {
    await sleepForMillis(3000);

    INFO('ACCOUNT-LINK', 'Test link: DOWNLOADING_DATA');
    accountLink = accountLink.setStatus('IN_PROGRESS / DOWNLOADING_DATA');
    await AccountLinkMutator.genSet(accountLink);
  }

  await sleepForMillis(3000);

  const terminalStatus = getTargetStatusForLoginForm(loginForm);

  if (terminalStatus !== 'SUCCESS') {
    accountLink = accountLink.setStatus(terminalStatus);
    await AccountLinkMutator.genSet(accountLink);
    return;
  }

  INFO('ACCOUNT-LINK', 'Test link: SYNC_WITH_SOURCE');
  accountLink = accountLink.setStatus('IN_PROGRESS / DOWNLOADING_FROM_SOURCE');
  await AccountLinkMutator.genSet(accountLink);

  await sleepForMillis(3000);

  INFO('ACCOUNT-LINK', 'Test link: SUCCESS');
  accountLink = accountLink.setStatus('SUCCESS');
  await AccountLinkMutator.genSet(accountLink);
}

// -----------------------------------------------------------------------------
//
// FORM VALIDATION
//
// -----------------------------------------------------------------------------

function isValidTestLoginForm(loginForm: YodleeLoginForm): boolean {
  return true;
}

function isValidTestMFAForm(mfaForm: YodleeLoginForm): boolean {
  return true;
}

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function isTestAccountLinkID(accountLinkID: ID): boolean {
  return accountLinkID.startsWith('TESTING_');
}

function getTargetStatusForLoginForm(
  loginForm: YodleeLoginForm,
): AccountLinkStatus {
  return 'SUCCESS';
}

function getShouldUseMFAForLoginForm(loginForm: YodleeLoginForm): boolean {
  return true;
}

function getDidPassMFAForMFAForm(mfa: YodleeLoginForm): boolean {
  return true;
}

function sleepForMillis(millis: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => resolve(), millis);
  });
}

export default {
  createTestAccountLink,
  createTestProvider,
  genTestMFALogin,
  getDidPassMFAForMFAForm,
  getShouldUseMFAForLoginForm,
  getTargetStatusForLoginForm,
  genTestPerformLink,
  isTestAccountLinkID,
  isValidTestLoginForm,
  isValidTestMFAForm,
};
