import ErrorState from '../ErrorState';
import InitializingState from '../InitializingState';
import LinkStateMachine from '../LinkStateMachine';
import LinkTerminationState from '../LinkTerminationState';
import PollingState from '../PollingState';
import SyncWithSourceState from '../SyncWithSourceState';

import type { ID } from 'common/types/core';

class MockLinkEngine {
  _accountLinkID: ID;
  _cb: Function | null = null;

  constructor(accountLinkID: ID) {
    this._accountLinkID = accountLinkID;
  }

  genLogEndLinking = jest.fn();
  genLogStartLinking = jest.fn();
  genRefetchAccountLink = jest.fn();
  genRefreshAccountLink = jest.fn();
  genSetAccountLink = jest.fn();
  genSetAccountLinkStatus = jest.fn();
  onLinkEvent = cb => {
    this._cb = cb;
    return { remove: () => cb && (cb = null) };
  };
  sendMockEvent = linkEvent => this._cb && this._cb(linkEvent);
}

let mockEngine;

const LOGIN_FORM = {
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
};

const ACCOUNT_LINK = {
  createdAt: new Date(),
  id: '0',
  modelType: 'AccountLink',
  sourceOfTruth: {
    loginForm: LOGIN_FORM,
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
};

const MOCK_EVENT = {
  badCredentials: {
    accountLink: {
      ...ACCOUNT_LINK,
      sourceOfTruth: {
        ...ACCOUNT_LINK.sourceOfTruth,
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
      },
    },
    type: 'UPDATE_ACCOUNT_LINK',
  },

  linkComplete: {
    type: 'LINK_COMPLETE',
  },

  pendingDownloadNoAdditionalStatus: {
    accountLink: {
      ...ACCOUNT_LINK,
      sourceOfTruth: {
        ...ACCOUNT_LINK.sourceOfTruth,
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
      },
    },
    type: 'UPDATE_ACCOUNT_LINK',
  },

  pendingLogin: {
    accountLink: ACCOUNT_LINK,
    type: 'UPDATE_ACCOUNT_LINK',
  },

  pendingUserInput: {
    accountLink: {
      ...ACCOUNT_LINK,
      sourceOfTruth: {
        ...ACCOUNT_LINK.sourceOfTruth,
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
      },
    },
    type: 'UPDATE_ACCOUNT_LINK',
  },

  pendingUserInputNoLoginForm: {
    accountLink: {
      ...ACCOUNT_LINK,
      sourceOfTruth: {
        ...ACCOUNT_LINK.sourceOfTruth,
        loginForm: null,
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
      },
    },
    type: 'UPDATE_ACCOUNT_LINK',
  },

  randomError: {
    errorMessage: 'This is a random error that hapenned',
    errorType: 'INTERNAL',
    type: 'ERROR',
  },

  sourceReady: {
    accountLink: {
      ...ACCOUNT_LINK,
      sourceOfTruth: {
        ...ACCOUNT_LINK.sourceOfTruth,
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
      },
    },
    type: 'UPDATE_ACCOUNT_LINK',
  },
};

const TEST_ACCOUNT_LINK_ID = '1';

jest.useFakeTimers();

beforeEach(() => {
  mockEngine = new MockLinkEngine(TEST_ACCOUNT_LINK_ID);

  mockEngine.genLogEndLinking.mockReturnValue(Promise.resolve());
  mockEngine.genLogStartLinking.mockReturnValue(Promise.resolve());
  mockEngine.genRefetchAccountLink.mockReturnValue(Promise.resolve());
  mockEngine.genRefreshAccountLink.mockReturnValue(Promise.resolve());
  mockEngine.genSetAccountLink.mockReturnValue(Promise.resolve());
  mockEngine.genSetAccountLinkStatus.mockReturnValue(Promise.resolve());
});

test('starts at initial link state by default', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'MANUAL',
    mockEngine,
  );
  expect(machine.getCurrentState()).toBeInstanceOf(InitializingState);
});

test('will refresh the account after the state machine is initialized', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'MANUAL',
    mockEngine,
  );
  machine.initialize();

  expect(mockEngine.genRefreshAccountLink.mock.calls).toHaveLength(1);
  expect(mockEngine.genRefreshAccountLink.mock.calls[0]).toHaveLength(0);
});

test('goes to polling state after receiving first update event', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'MANUAL',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.pendingLogin);

  jest.runAllTimers();

  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);
  expect(mockEngine.genRefetchAccountLink.mock.calls).toHaveLength(1);
  expect(mockEngine.genRefetchAccountLink.mock.calls[0]).toHaveLength(0);
});

test('stays in polling state after receiving a non-terminal provider update', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'MANUAL',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  jest.runAllTimers();
  mockEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  jest.runAllTimers();

  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);
});

test('re-fetches provider accounts after each update', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'MANUAL',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  jest.runAllTimers();
  mockEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  jest.runAllTimers();

  expect(mockEngine.genRefetchAccountLink.mock.calls).toHaveLength(2);
});

test('goes into error from initializing', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'MANUAL',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.randomError);

  expect(machine.getCurrentState()).toBeInstanceOf(ErrorState);
});

test('goes into error from polling state', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'MANUAL',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  mockEngine.sendMockEvent(MOCK_EVENT.randomError);
  expect(machine.getCurrentState()).toBeInstanceOf(ErrorState);
});

test('updates account link status when going into error state', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'MANUAL',
    mockEngine,
  );
  machine.initialize();

  const genSetAccountLinkStatusMockCalls =
    mockEngine.genSetAccountLinkStatus.mock.calls;

  mockEngine.sendMockEvent(MOCK_EVENT.randomError);
  expect(machine.getCurrentState()).toBeInstanceOf(ErrorState);
  expect(genSetAccountLinkStatusMockCalls).toHaveLength(1);
  expect(genSetAccountLinkStatusMockCalls[0][0]).toBe(
    'FAILURE / INTERNAL_SERVICE_FAILURE',
  );
});

test('updates the account link status when receives pending login', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'MANUAL',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  const genSetAccountLinkStatusMockCalls =
    mockEngine.genSetAccountLinkStatus.mock.calls;

  expect(genSetAccountLinkStatusMockCalls).toHaveLength(1);
  expect(genSetAccountLinkStatusMockCalls[0][0]).toBe(
    'IN_PROGRESS / VERIFYING_CREDENTIALS',
  );
});

test('updates the account link status when receiving pending user input', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'MANUAL',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.pendingUserInput);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  const genSetAccountLinkStatusMockCalls =
    mockEngine.genSetAccountLinkStatus.mock.calls;

  expect(genSetAccountLinkStatusMockCalls).toHaveLength(1);
  expect(genSetAccountLinkStatusMockCalls[0][0]).toBe(
    'MFA / PENDING_USER_INPUT',
  );
});

// eslint-disable-next-line max-len
test('marks account link as waiting for login form when pending user input with no login form', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'MANUAL',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.pendingUserInputNoLoginForm);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  const genSetAccountLinkStatusMockCalls =
    mockEngine.genSetAccountLinkStatus.mock.calls;

  expect(genSetAccountLinkStatusMockCalls).toHaveLength(1);
  expect(genSetAccountLinkStatusMockCalls[0][0]).toBe(
    'MFA / WAITING_FOR_LOGIN_FORM',
  );
});

test('marks account link as downloading when no additional status is in refresh info', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'MANUAL',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.pendingDownloadNoAdditionalStatus);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  const genSetAccountLinkStatusMockCalls =
    mockEngine.genSetAccountLinkStatus.mock.calls;

  expect(genSetAccountLinkStatusMockCalls).toHaveLength(1);
  expect(genSetAccountLinkStatusMockCalls[0][0]).toBe(
    'IN_PROGRESS / DOWNLOADING_DATA',
  );
});

test('marks pending user input as failure if downloading in the background', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'AUTO',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.pendingUserInput);
  expect(machine.getCurrentState()).toBeInstanceOf(LinkTerminationState);

  const genSetAccountLinkStatusMockCalls =
    mockEngine.genSetAccountLinkStatus.mock.calls;

  expect(genSetAccountLinkStatusMockCalls).toHaveLength(1);
  expect(genSetAccountLinkStatusMockCalls[0][0]).toBe(
    'FAILURE / USER_INPUT_REQUEST_IN_BACKGROUND',
  );
});

test('terminates linking on bad credentials', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'AUTO',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.badCredentials);
  expect(machine.getCurrentState()).toBeInstanceOf(LinkTerminationState);
});

test('goes from polling state to sync-with-source state on SUCCESS status', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'AUTO',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  mockEngine.sendMockEvent(MOCK_EVENT.sourceReady);
  expect(machine.getCurrentState()).toBeInstanceOf(SyncWithSourceState);
});

test('does not perform any refetches when leaving the polling state early', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'AUTO',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  mockEngine.sendMockEvent(MOCK_EVENT.randomError);

  expect(machine.getCurrentState()).toBeInstanceOf(ErrorState);

  jest.runAllTimers();
  expect(mockEngine.genRefetchAccountLink.mock.calls).toHaveLength(0);
});

// eslint-disable-next-line max-len
test('updates account link status to IN_PROGRESS / DOWNLOADING_FROM_SOURCE when sync starts', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'AUTO',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.sourceReady);
  expect(machine.getCurrentState()).toBeInstanceOf(SyncWithSourceState);

  const genSetAccountLinkStatusMockCalls =
    mockEngine.genSetAccountLinkStatus.mock.calls;

  expect(genSetAccountLinkStatusMockCalls).toHaveLength(1);
  expect(genSetAccountLinkStatusMockCalls[0][0]).toBe(
    'IN_PROGRESS / DOWNLOADING_FROM_SOURCE',
  );
});

test('starts logging on initialization state', () => {
  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'AUTO',
    mockEngine,
  );
  machine.initialize();

  expect(machine.getCurrentState()).toBeInstanceOf(InitializingState);

  const genLogStartLinkingMockCalls = mockEngine.genLogStartLinking.mock.calls;

  expect(genLogStartLinkingMockCalls).toHaveLength(1);
  expect(genLogStartLinkingMockCalls[0]).toHaveLength(0);
});

test('ends logging after account link status has been update in termination state', async () => {
  expect.assertions(4);

  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'AUTO',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.sourceReady);

  mockEngine.genSetAccountLinkStatus.mockReset();

  let finishSettingAccountLinkStatus;
  const waitForSettingAccountLinkStatus = new Promise(resolve => {
    finishSettingAccountLinkStatus = resolve;
  });

  mockEngine.genSetAccountLinkStatus.mockImplementation(
    () => waitForSettingAccountLinkStatus,
  );

  mockEngine.sendMockEvent(MOCK_EVENT.linkComplete);
  expect(machine.getCurrentState()).toBeInstanceOf(LinkTerminationState);

  expect(mockEngine.genSetAccountLinkStatus.mock.calls).toHaveLength(1);
  expect(mockEngine.genLogEndLinking.mock.calls).toHaveLength(0);

  finishSettingAccountLinkStatus();
  await waitForSettingAccountLinkStatus;

  expect(mockEngine.genLogEndLinking.mock.calls).toHaveLength(1);
});

test('ends logging after account link status has been updated in error state', async () => {
  expect.assertions(4);

  let finishSettingAccountLinkStatus;
  const waitForSettingAccountLinkStatus = new Promise(resolve => {
    finishSettingAccountLinkStatus = resolve;
  });
  mockEngine.genSetAccountLinkStatus.mockImplementation(
    () => waitForSettingAccountLinkStatus,
  );

  const machine = new LinkStateMachine(
    TEST_ACCOUNT_LINK_ID,
    'AUTO',
    mockEngine,
  );
  machine.initialize();

  mockEngine.sendMockEvent(MOCK_EVENT.randomError);
  expect(machine.getCurrentState()).toBeInstanceOf(ErrorState);

  expect(mockEngine.genSetAccountLinkStatus.mock.calls).toHaveLength(1);
  expect(mockEngine.genLogEndLinking.mock.calls).toHaveLength(0);

  finishSettingAccountLinkStatus();
  await waitForSettingAccountLinkStatus;

  expect(mockEngine.genLogEndLinking.mock.calls).toHaveLength(1);
});
