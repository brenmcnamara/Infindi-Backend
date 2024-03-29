import AccountLink from 'common/lib/models/AccountLink';
import AccountLinkFetcher from 'common/lib/models/AccountLinkFetcher';
import AccountLinkMutator from 'common/lib/models/AccountLinkMutator';
import ErrorState from '../ErrorState';
import InitializingState from '../InitializingState';
import LinkStateMachine from '../LinkStateMachine';
import LinkTerminateWithoutUpdatingState from '../LinkTerminateWithoutUpdatingState';
import LinkUpdateAndTerminateState from '../LinkUpdateAndTerminateState';
import PollingState from '../PollingState';
import ProviderFetcher from 'common/lib/models/ProviderFetcher';
import SyncWithSourceState from '../SyncWithSourceState';
import YodleeManager from '../../../../yodlee/YodleeManager-V1.0';

import type { ID } from 'common/types/core';

jest
  .mock('common/lib/models/AccountFetcher')
  .mock('common/lib/models/AccountLinkFetcher')
  .mock('common/lib/models/AccountLinkMutator')
  .mock('common/lib/models/AccountMutator')
  .mock('common/lib/models/ProviderFetcher')
  .mock('common/lib/models/ProviderMutator')
  .mock('common/lib/models/TransactionFetcher')
  .mock('common/lib/models/TransactionMutator')
  .mock('../../../../log-utils')
  .mock('../../../../yodlee/YodleeManager-V1.0');

class MockLinkEngine {
  _accountLinkID: ID;
  _cb: Function | null = null;

  constructor(accountLinkID: ID) {
    this._accountLinkID = accountLinkID;
  }

  setProviderAccountID = jest.fn();

  genFetchUserID = jest.fn();
  genRefetchAccountLink = jest.fn();
  genRefreshAccountLink = jest.fn();

  onLinkEvent = cb => {
    this._cb = cb;
    return { remove: () => cb && (cb = null) };
  };
  sendMockEvent = linkEvent => this._cb && this._cb(linkEvent);
  sendEvent = jest.fn();
}

let mockEngine;

const LOGIN_FORMS = {
  blank: {
    row: [
      {
        field: [
          {
            valueEditable: true,
            type: 'text',
            value: '',
            id: 567,
            isOptional: false,
            maxLength: 32,
            name: 'LOGIN',
          },
        ],
        form: '0001',
        fieldRowChoice: '0001',
        id: 4710,
        label: 'User ID',
      },
      {
        field: [
          {
            name: 'PASSWORD',
            valueEditable: true,
            type: 'password',
            value: '',
            id: 568,
            isOptional: false,
          },
        ],
        form: '0001',
        fieldRowChoice: '0002',
        id: 11976,
        label: 'Password',
      },
    ],
    id: 324,
    forgetPasswordURL:
      'https://chaseonline.chase.com/Public/ReIdentify/ReidentifyFilterView.aspx?COLLogon',
    formType: 'login',
  },

  filledOut: {
    row: [
      {
        field: [
          {
            valueEditable: true,
            type: 'text',
            value: 'MY USER NAME',
            id: 567,
            isOptional: false,
            maxLength: 32,
            name: 'LOGIN',
          },
        ],
        form: '0001',
        fieldRowChoice: '0001',
        id: 4710,
        label: 'User ID',
      },
      {
        field: [
          {
            name: 'PASSWORD',
            valueEditable: true,
            type: 'password',
            value: 'MY PASSWORD',
            id: 568,
            isOptional: false,
          },
        ],
        form: '0001',
        fieldRowChoice: '0002',
        id: 11976,
        label: 'Password',
      },
    ],
    id: 324,
    forgetPasswordURL:
      'https://chaseonline.chase.com/Public/ReIdentify/ReidentifyFilterView.aspx?COLLogon',
    formType: 'login',
  },
};

const ACCOUNT_LINKS = {
  DownloadingToDownloading: AccountLink.fromRaw({
    createdAt: new Date(),
    id: '0',
    modelType: 'AccountLink',
    providerRef: {
      pointerType: 'Provider',
      refID: '0',
      type: 'POINTER',
    },
    sourceOfTruth: {
      loginForm: LOGIN_FORMS.blank,
      providerAccount: {
        aggregationSource: 'USER',
        createdDate: '2018-05-10',
        id: 0,
        isManual: false,
        lastUpdated: '2018-05-15T04:23:10Z',
        loginForm: null,
        providerId: '643',
        refreshInfo: {
          lastRefreshed: '2018-05-15T04:23:10Z',
          status: 'IN_PROGRESS',
        },
      },
      type: 'YODLEE',
    },
    status: 'IN_PROGRESS / DOWNLOADING_DATA',
    type: 'MODEL',
    updatedAt: new Date(),
    userRef: {
      refID: 0,
      type: 'POINTER',
    },
  }),

  DownloadingToSyncing: AccountLink.fromRaw({
    createdAt: new Date(),
    id: '0',
    modelType: 'AccountLink',
    providerRef: {
      pointerType: 'Provider',
      refID: '0',
      type: 'POINTER',
    },
    sourceOfTruth: {
      loginForm: LOGIN_FORMS.blank,
      providerAccount: {
        aggregationSource: 'USER',
        createdDate: '2018-05-10',
        id: 0,
        isManual: false,
        lastUpdated: '2018-05-15T04:23:10Z',
        loginForm: null,
        providerId: '643',
        refreshInfo: {
          lastRefreshed: '2018-05-15T04:23:10Z',
          status: 'SUCCESS',
        },
      },
      type: 'YODLEE',
    },
    status: 'IN_PROGRESS / DOWNLOADING_DATA',
    type: 'MODEL',
    updatedAt: new Date(),
    userRef: {
      refID: 0,
      type: 'POINTER',
    },
  }),

  LoginToBadCredentials: AccountLink.fromRaw({
    createdAt: new Date(),
    id: '0',
    modelType: 'AccountLink',
    providerRef: {
      pointerType: 'Provider',
      refID: '0',
      type: 'POINTER',
    },
    sourceOfTruth: {
      loginForm: LOGIN_FORMS.blank,
      providerAccount: {
        aggregationSource: 'USER',
        createdDate: '2018-05-10',
        id: 0,
        isManual: false,
        lastUpdated: '2018-05-15T04:23:10Z',
        loginForm: null,
        providerId: '643',
        refreshInfo: {
          additionalStatus: 'LOGIN_FAILED',
          lastRefreshed: '2018-05-15T04:23:10Z',
          status: 'FAILED',
        },
      },
      type: 'YODLEE',
    },
    status: 'IN_PROGRESS / VERIFYING_CREDENTIALS',
    type: 'MODEL',
    updatedAt: new Date(),
    userRef: {
      refID: 0,
      type: 'POINTER',
    },
  }),

  LoginToDownloading: AccountLink.fromRaw({
    createdAt: new Date(),
    id: '0',
    modelType: 'AccountLink',
    providerRef: {
      pointerType: 'Provider',
      refID: '0',
      type: 'POINTER',
    },
    sourceOfTruth: {
      loginForm: LOGIN_FORMS.blank,
      providerAccount: {
        aggregationSource: 'USER',
        createdDate: '2018-05-10',
        id: 0,
        isManual: false,
        lastUpdated: '2018-05-15T04:23:10Z',
        loginForm: null,
        providerId: '643',
        refreshInfo: {
          lastRefreshed: '2018-05-15T04:23:10Z',
          status: 'IN_PROGRESS',
        },
      },
      type: 'YODLEE',
    },
    status: 'IN_PROGRESS / VERIFYING_CREDENTIALS',
    type: 'MODEL',
    updatedAt: new Date(),
    userRef: {
      refID: 0,
      type: 'POINTER',
    },
  }),

  LoginToLogin: AccountLink.fromRaw({
    createdAt: new Date(),
    id: '0',
    modelType: 'AccountLink',
    providerRef: {
      pointerType: 'Provider',
      refID: '0',
      type: 'POINTER',
    },
    sourceOfTruth: {
      loginForm: LOGIN_FORMS.blank,
      providerAccount: {
        aggregationSource: 'USER',
        createdDate: '2018-05-10',
        id: 0,
        isManual: false,
        lastUpdated: '2018-05-15T04:23:10Z',
        loginForm: null,
        providerId: '643',
        refreshInfo: {
          additionalStatus: 'LOGIN_IN_PROGRESS',
          lastRefreshed: '2018-05-15T04:23:10Z',
          status: 'IN_PROGRESS',
        },
      },
      type: 'YODLEE',
    },
    status: 'IN_PROGRESS / VERIFYING_CREDENTIALS',
    type: 'MODEL',
    updatedAt: new Date(),
    userRef: {
      refID: 0,
      type: 'POINTER',
    },
  }),

  LoginToWaitingForLoginForm: AccountLink.fromRaw({
    createdAt: new Date(),
    id: '0',
    modelType: 'AccountLink',
    providerRef: {
      pointerType: 'Provider',
      refID: '0',
      type: 'POINTER',
    },
    sourceOfTruth: {
      providerAccount: {
        aggregationSource: 'USER',
        createdDate: '2018-05-10',
        id: 0,
        isManual: false,
        lastUpdated: '2018-05-15T04:23:10Z',
        loginForm: null,
        providerId: '643',
        refreshInfo: {
          additionalStatus: 'USER_INPUT_REQUIRED',
          lastRefreshed: '2018-05-15T04:23:10Z',
          status: 'IN_PROGRESS',
        },
      },
      type: 'YODLEE',
    },
    status: 'IN_PROGRESS / VERIFYING_CREDENTIALS',
    type: 'MODEL',
    updatedAt: new Date(),
    userRef: {
      refID: 0,
      type: 'POINTER',
    },
  }),

  SuccessToLogin: AccountLink.fromRaw({
    createdAt: new Date(),
    id: '0',
    modelType: 'AccountLink',
    providerRef: {
      pointerType: 'Provider',
      refID: '0',
      type: 'POINTER',
    },
    sourceOfTruth: {
      loginForm: LOGIN_FORMS.blank,
      providerAccount: {
        aggregationSource: 'USER',
        createdDate: '2018-05-10',
        id: 0,
        isManual: false,
        lastUpdated: '2018-05-15T04:23:10Z',
        loginForm: null,
        providerId: '643',
        refreshInfo: {
          additionalStatus: 'LOGIN_IN_PROGRESS',
          lastRefreshed: '2018-05-15T04:23:10Z',
          status: 'IN_PROGRESS',
        },
      },
      type: 'YODLEE',
    },
    status: 'SUCCESS',
    type: 'MODEL',
    updatedAt: new Date(),
    userRef: {
      refID: 0,
      type: 'POINTER',
    },
  }),

  WaitingForLoginFormToPendingUserInput: AccountLink.fromRaw({
    createdAt: new Date(),
    id: '0',
    modelType: 'AccountLink',
    providerRef: {
      pointerType: 'Provider',
      refID: '0',
      type: 'POINTER',
    },
    sourceOfTruth: {
      loginForm: LOGIN_FORMS.blank,
      providerAccount: {
        aggregationSource: 'USER',
        createdDate: '2018-05-10',
        id: 0,
        isManual: false,
        lastUpdated: '2018-05-15T04:23:10Z',
        loginForm: null,
        providerId: '643',
        refreshInfo: {
          additionalStatus: 'USER_INPUT_REQUIRED',
          lastRefreshed: '2018-05-15T04:23:10Z',
          status: 'IN_PROGRESS',
        },
      },
      type: 'YODLEE',
    },
    status: 'MFA / WAITING_FOR_LOGIN_FORM',
    type: 'MODEL',
    updatedAt: new Date(),
    userRef: {
      refID: 0,
      type: 'POINTER',
    },
  }),
};

const MOCK_EVENT = {
  downloadingToDownloading: {
    accountLink: ACCOUNT_LINKS.DownloadingToDownloading,
    type: 'UPDATE_ACCOUNT_LINK',
  },

  downloadingToSyncing: {
    accountLink: ACCOUNT_LINKS.DownloadingToSyncing,
    type: 'UPDATE_ACCOUNT_LINK',
  },

  linkComplete: {
    type: 'LINK_COMPLETE',
  },

  loginToBadCredentials: {
    accountLink: ACCOUNT_LINKS.LoginToBadCredentials,
    type: 'UPDATE_ACCOUNT_LINK',
  },

  loginToLogin: {
    accountLink: ACCOUNT_LINKS.LoginToLogin,
    type: 'UPDATE_ACCOUNT_LINK',
  },

  loginToDownloading: {
    accountLink: ACCOUNT_LINKS.LoginToDownloading,
    type: 'UPDATE_ACCOUNT_LINK',
  },

  loginToWaitingForLoginForm: {
    accountLink: ACCOUNT_LINKS.LoginToWaitingForLoginForm,
    type: 'UPDATE_ACCOUNT_LINK',
  },

  pendingLogin: {
    accountLink: ACCOUNT_LINKS.SuccessToStartedLinking,
    type: 'UPDATE_ACCOUNT_LINK',
  },

  randomError: {
    errorMessage: 'This is a random error that hapenned',
    errorType: 'INTERNAL',
    type: 'ERROR',
  },

  startLinking: {
    accountLink: ACCOUNT_LINKS.SuccessToStartedLinking,
    type: 'UPDATE_ACCOUNT_LINK',
  },

  successToLogin: {
    accountLink: ACCOUNT_LINKS.SuccessToLogin,
    type: 'UPDATE_ACCOUNT_LINK',
  },

  waitingForLoginFormToPendingUserInput: {
    accountLink: ACCOUNT_LINKS.WaitingForLoginFormToPendingUserInput,
    type: 'UPDATE_ACCOUNT_LINK',
  },
};

const TEST_ACCOUNT_LINK_ID = '1';
const TEST_USER_ID = '2';

jest.useFakeTimers();

beforeEach(() => {
  mockEngine = new MockLinkEngine(TEST_ACCOUNT_LINK_ID);

  mockEngine.setProviderAccountID.mockReturnValue(undefined);
  mockEngine.genRefetchAccountLink.mockReturnValue(Promise.resolve());
  mockEngine.genRefreshAccountLink.mockReturnValue(Promise.resolve());
  mockEngine.genFetchUserID.mockReturnValue(Promise.resolve(TEST_USER_ID));

  AccountLinkMutator.genDelete.mockClear();
  AccountLinkMutator.genDeleteCollection.mockClear();
  AccountLinkMutator.genSet.mockClear();
  AccountLinkMutator.genSetCollection.mockClear();

  YodleeManager.genProviderLogin.mockClear();
});

test('starts at initial link state by default', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'FOREGROUND_UPDATE',
    mockEngine,
  );
  expect(machine.getCurrentState()).toBeInstanceOf(InitializingState);
});

test('will refresh the account after the state machine is initialized', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'FOREGROUND_UPDATE' },
  });
  machine.initialize();

  expect(mockEngine.genRefreshAccountLink.mock.calls).toHaveLength(1);
  expect(mockEngine.genRefreshAccountLink.mock.calls[0]).toHaveLength(0);
});

test('will login to provider after the state machine is initialized with login', async () => {
  expect.assertions(2);

  AccountLinkFetcher.genNullthrows.mockReturnValue(
    Promise.resolve(ACCOUNT_LINKS.LoginToLogin),
  );
  ProviderFetcher.genNullthrows.mockReturnValue(
    Promise.resolve({ sourceOfTruth: { type: 'YODLEE', value: {} } }),
  );

  // TODO: Would like to figure out how to better structure tests to avoid
  // awkward async checks like this. Here we are mocking the implementation
  // of the yodlee provider login call so that we can check when it is called
  // and block the tests until we have called the method.
  let resolveYodleeProviderLoginCall;
  const waitForYodleeProviderLogin = new Promise(
    resolve => (resolveYodleeProviderLoginCall = resolve),
  );
  YodleeManager.genProviderLogin.mockImplementation(() => {
    resolveYodleeProviderLoginCall();
    return Promise.resolve({providerAccountId: 0});
  });

  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { loginForm: LOGIN_FORMS.filledOut, type: 'PERFORM_LOGIN' },
  });
  machine.initialize();

  await waitForYodleeProviderLogin;

  expect(YodleeManager.genProviderLogin.mock.calls).toHaveLength(1);
});

test('goes to polling state after receiving first update event', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'FOREGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);

  jest.runAllTimers();

  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);
  expect(mockEngine.genRefetchAccountLink.mock.calls).toHaveLength(1);
  expect(mockEngine.genRefetchAccountLink.mock.calls[0]).toHaveLength(0);
});

test('stays in polling state after receiving a non-terminal provider update', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'FOREGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);
  jest.runAllTimers();
  mockEngine.sendMockEvent(MOCK_EVENT.loginToLogin);
  jest.runAllTimers();

  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);
});

test('terminates link if initializing  with an account link that is already linking', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'FOREGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.downloadingToDownloading);
  expect(machine.getCurrentState()).toBeInstanceOf(
    LinkTerminateWithoutUpdatingState,
  );
});

test('re-fetches provider accounts after each update', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'FOREGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);
  jest.runAllTimers();
  mockEngine.sendMockEvent(MOCK_EVENT.loginToLogin);
  jest.runAllTimers();

  expect(mockEngine.genRefetchAccountLink.mock.calls).toHaveLength(2);
});

test('goes into error from initializing on error', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'FOREGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.randomError);

  expect(machine.getCurrentState()).toBeInstanceOf(ErrorState);
});

test('goes into error from polling state', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'FOREGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  mockEngine.sendMockEvent(MOCK_EVENT.randomError);
  expect(machine.getCurrentState()).toBeInstanceOf(ErrorState);
});

test('updates account link status when going into error state', async () => {
  expect.assertions(3);

  const fetchAccountLink = Promise.resolve(ACCOUNT_LINKS.LoginToLogin);
  AccountLinkFetcher.genNullthrows.mockReturnValue(fetchAccountLink);

  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'FOREGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.randomError);
  expect(machine.getCurrentState()).toBeInstanceOf(ErrorState);

  await fetchAccountLink;

  expect(AccountLinkMutator.genSet.mock.calls).toHaveLength(1);
  expect(AccountLinkMutator.genSet.mock.calls[0][0].status).toBe(
    'FAILURE / INTERNAL_SERVICE_FAILURE',
  );
});

test('updates the account link status when receiving pending login', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'FOREGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  expect(AccountLinkMutator.genSet.mock.calls).toHaveLength(1);
  expect(AccountLinkMutator.genSet.mock.calls[0][0].status).toBe(
    'IN_PROGRESS / VERIFYING_CREDENTIALS',
  );
});

// eslint-disable-next-line max-len
test('marks account link as waiting for login form when pending user input with no login form', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'FOREGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);
  mockEngine.sendMockEvent(MOCK_EVENT.loginToWaitingForLoginForm);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  expect(AccountLinkMutator.genSet.mock.calls).toHaveLength(2);
  expect(AccountLinkMutator.genSet.mock.calls[1][0].status).toBe(
    'MFA / WAITING_FOR_LOGIN_FORM',
  );
});

test('updates the account link status when receiving pending user input', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'FOREGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);
  mockEngine.sendMockEvent(MOCK_EVENT.loginToWaitingForLoginForm);
  mockEngine.sendMockEvent(MOCK_EVENT.waitingForLoginFormToPendingUserInput);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  expect(AccountLinkMutator.genSet.mock.calls).toHaveLength(3);
  expect(AccountLinkMutator.genSet.mock.calls[2][0].status).toBe(
    'MFA / PENDING_USER_INPUT',
  );
});

test('marks account link as downloading when no additional status is in refresh info', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'FOREGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);
  mockEngine.sendMockEvent(MOCK_EVENT.loginToDownloading);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  expect(AccountLinkMutator.genSet.mock.calls).toHaveLength(2);
  expect(AccountLinkMutator.genSet.mock.calls[1][0].status).toBe(
    'IN_PROGRESS / DOWNLOADING_DATA',
  );
});

test('allows status WAITING_FOR_LOGIN_FORM during BACKGROUND_UPDATE', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'BACKGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);
  mockEngine.sendMockEvent(MOCK_EVENT.loginToWaitingForLoginForm);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  expect(AccountLinkMutator.genSet.mock.calls).toHaveLength(2);
  expect(AccountLinkMutator.genSet.mock.calls[1][0].status).toBe(
    'MFA / WAITING_FOR_LOGIN_FORM',
  );
});

test('marks pending user input as failure if downloading in the background', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'BACKGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);
  mockEngine.sendMockEvent(MOCK_EVENT.loginToWaitingForLoginForm);
  mockEngine.sendMockEvent(MOCK_EVENT.waitingForLoginFormToPendingUserInput);
  expect(machine.getCurrentState()).toBeInstanceOf(LinkUpdateAndTerminateState);

  expect(AccountLinkMutator.genSet.mock.calls).toHaveLength(3);
  expect(AccountLinkMutator.genSet.mock.calls[2][0].status).toBe(
    'FAILURE / USER_INPUT_REQUEST_IN_BACKGROUND',
  );
});

test('terminates linking on bad credentials', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'BACKGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);
  mockEngine.sendMockEvent(MOCK_EVENT.loginToBadCredentials);
  expect(machine.getCurrentState()).toBeInstanceOf(LinkUpdateAndTerminateState);
});

test('goes from polling state to sync-with-source state on SUCCESS status', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'BACKGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);
  mockEngine.sendMockEvent(MOCK_EVENT.loginToDownloading);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  mockEngine.sendMockEvent(MOCK_EVENT.downloadingToSyncing);
  expect(machine.getCurrentState()).toBeInstanceOf(SyncWithSourceState);
});

test('does not perform any refetches when leaving the polling state early', () => {
  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'BACKGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);
  mockEngine.sendMockEvent(MOCK_EVENT.randomError);

  expect(machine.getCurrentState()).toBeInstanceOf(ErrorState);

  jest.runAllTimers();
  expect(mockEngine.genRefetchAccountLink.mock.calls).toHaveLength(0);
});

// eslint-disable-next-line max-len
test('updates account link status to IN_PROGRESS / DOWNLOADING_FROM_SOURCE when sync starts', () => {
  expect.assertions(3);

  const machine = new LinkStateMachine({
    accountLinkID: TEST_ACCOUNT_LINK_ID,
    engine: mockEngine,
    payload: { type: 'BACKGROUND_UPDATE' },
  });
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.successToLogin);
  mockEngine.sendMockEvent(MOCK_EVENT.loginToDownloading);

  AccountLinkMutator.genSet.mockClear();

  mockEngine.sendMockEvent(MOCK_EVENT.downloadingToSyncing);
  expect(machine.getCurrentState()).toBeInstanceOf(SyncWithSourceState);

  expect(AccountLinkMutator.genSet.mock.calls).toHaveLength(1);
  expect(AccountLinkMutator.genSet.mock.calls[0][0].status).toBe(
    'IN_PROGRESS / DOWNLOADING_FROM_SOURCE',
  );
});
