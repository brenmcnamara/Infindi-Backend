import ErrorState from '../ErrorState';
import InitializingState from '../InitializingState';
import LinkEngine from '../LinkEngine';
import LinkStateMachine from '../LinkStateMachine';
import LinkTerminationState from '../LinkTerminationState';
import PollingState from '../PollingState';

jest.useFakeTimers();

jest.mock('../LinkEngine', () => {
  let cb = null;
  return {
    genLogEndLinking: jest.fn(),
    genLogStartLinking: jest.fn(),
    genRefetchAccountLink: jest.fn(),
    genRefreshAccountLink: jest.fn(),
    genSetAccountLink: jest.fn(),
    genSetAccountLinkStatus: jest.fn(),
    onLinkEvent: _cb => {
      cb = _cb;
      return { remove: () => (cb = null) };
    },
    sendMockEvent: linkEvent => cb && cb(linkEvent),
  };
});

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
};

beforeEach(() => {
  LinkEngine.genLogEndLinking.mockReset();
  LinkEngine.genLogStartLinking.mockReset();
  LinkEngine.genRefetchAccountLink.mockReset();
  LinkEngine.genRefreshAccountLink.mockReset();
  LinkEngine.genSetAccountLink.mockReset();
  LinkEngine.genSetAccountLinkStatus.mockReset();

  LinkEngine.genLogEndLinking.mockReturnValue(Promise.resolve());
  LinkEngine.genLogStartLinking.mockReturnValue(Promise.resolve());
  LinkEngine.genRefetchAccountLink.mockReturnValue(Promise.resolve());
  LinkEngine.genRefreshAccountLink.mockReturnValue(Promise.resolve());
  LinkEngine.genSetAccountLink.mockReturnValue(Promise.resolve());
  LinkEngine.genSetAccountLinkStatus.mockReturnValue(Promise.resolve());
});

test('starts at initial link state by default', () => {
  const machine = new LinkStateMachine('0', 'MANUAL');
  expect(machine.getCurrentState()).toBeInstanceOf(InitializingState);
});

test('will refresh the account after the state machine is initialized', () => {
  const accountLinkID = '0';

  const machine = new LinkStateMachine(accountLinkID, 'MANUAL');
  machine.initialize();

  expect(LinkEngine.genRefreshAccountLink.mock.calls).toHaveLength(1);
  expect(LinkEngine.genRefreshAccountLink.mock.calls[0][0]).toBe(accountLinkID);
});

test('goes to polling state after receiving first update event', () => {
  const accountLinkID = '0';

  const machine = new LinkStateMachine(accountLinkID, 'MANUAL');
  machine.initialize();

  LinkEngine.sendMockEvent(MOCK_EVENT.pendingLogin);

  jest.runAllTimers();

  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);
  expect(LinkEngine.genRefetchAccountLink.mock.calls).toHaveLength(1);
  expect(LinkEngine.genRefetchAccountLink.mock.calls[0][0]).toBe(accountLinkID);
});

test('stays in polling state after receiving a non-terminal provider update', () => {
  const accountLinkID = '0';

  const machine = new LinkStateMachine(accountLinkID, 'MANUAL');
  machine.initialize();

  LinkEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  jest.runAllTimers();
  LinkEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  jest.runAllTimers();

  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);
});

test('re-fetches provider accounts after each update', () => {
  const accountLinkID = '0';

  const machine = new LinkStateMachine(accountLinkID, 'MANUAL');
  machine.initialize();

  LinkEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  jest.runAllTimers();
  LinkEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  jest.runAllTimers();

  expect(LinkEngine.genRefetchAccountLink.mock.calls).toHaveLength(2);
});

test('goes into error from initializing', () => {
  const accountLinkID = '0';

  const machine = new LinkStateMachine(accountLinkID, 'MANUAL');
  machine.initialize();

  LinkEngine.sendMockEvent(MOCK_EVENT.randomError);

  expect(machine.getCurrentState()).toBeInstanceOf(ErrorState);
});

test('goes into error from polling state', () => {
  const accountLinkID = '0';

  const machine = new LinkStateMachine(accountLinkID, 'MANUAL');
  machine.initialize();

  LinkEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  LinkEngine.sendMockEvent(MOCK_EVENT.randomError);
  expect(machine.getCurrentState()).toBeInstanceOf(ErrorState);
});

test('updates the account link status when receives pending login', () => {
  const accountLinkID = '0';

  const machine = new LinkStateMachine(accountLinkID, 'MANUAL');
  machine.initialize();

  LinkEngine.sendMockEvent(MOCK_EVENT.pendingLogin);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  const genSetAccountLinkStatusMockCalls =
    LinkEngine.genSetAccountLinkStatus.mock.calls;

  expect(genSetAccountLinkStatusMockCalls).toHaveLength(1);
  expect(genSetAccountLinkStatusMockCalls[0][0]).toBe(accountLinkID);
  expect(genSetAccountLinkStatusMockCalls[0][1]).toBe(
    'IN_PROGRESS / VERIFYING_CREDENTIALS',
  );
});

test('updates the account link status when receiving pending user input', () => {
  const accountLinkID = '0';

  const machine = new LinkStateMachine(accountLinkID, 'MANUAL');
  machine.initialize();

  LinkEngine.sendMockEvent(MOCK_EVENT.pendingUserInput);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  const genSetAccountLinkStatusMockCalls =
    LinkEngine.genSetAccountLinkStatus.mock.calls;

  expect(genSetAccountLinkStatusMockCalls).toHaveLength(1);
  expect(genSetAccountLinkStatusMockCalls[0][0]).toBe(accountLinkID);
  expect(genSetAccountLinkStatusMockCalls[0][1]).toBe(
    'MFA / PENDING_USER_INPUT',
  );
});

// eslint-disable-next-line max-len
test('marks account link as waiting for login form when pending user input with no login form', () => {
  const accountLinkID = '0';

  const machine = new LinkStateMachine(accountLinkID, 'MANUAL');
  machine.initialize();

  LinkEngine.sendMockEvent(MOCK_EVENT.pendingUserInputNoLoginForm);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  const genSetAccountLinkStatusMockCalls =
    LinkEngine.genSetAccountLinkStatus.mock.calls;

  expect(genSetAccountLinkStatusMockCalls).toHaveLength(1);
  expect(genSetAccountLinkStatusMockCalls[0][0]).toBe(accountLinkID);
  expect(genSetAccountLinkStatusMockCalls[0][1]).toBe(
    'MFA / WAITING_FOR_LOGIN_FORM',
  );
});

test('marks account link as downloading when no additional status is in refresh info', () => {
  const accountLinkID = '0';

  const machine = new LinkStateMachine(accountLinkID, 'MANUAL');
  machine.initialize();

  LinkEngine.sendMockEvent(MOCK_EVENT.pendingDownloadNoAdditionalStatus);
  expect(machine.getCurrentState()).toBeInstanceOf(PollingState);

  const genSetAccountLinkStatusMockCalls =
    LinkEngine.genSetAccountLinkStatus.mock.calls;

  expect(genSetAccountLinkStatusMockCalls).toHaveLength(1);
  expect(genSetAccountLinkStatusMockCalls[0][0]).toBe(accountLinkID);
  expect(genSetAccountLinkStatusMockCalls[0][1]).toBe(
    'IN_PROGRESS / DOWNLOADING_DATA',
  );
});

test('marks pending user input as failure if downloading in the background', () => {
  const accountLinkID = '0';

  const machine = new LinkStateMachine(accountLinkID, 'AUTO');
  machine.initialize();

  LinkEngine.sendMockEvent(MOCK_EVENT.pendingUserInput);
  expect(machine.getCurrentState()).toBeInstanceOf(LinkTerminationState);

  const genSetAccountLinkStatusMockCalls =
    LinkEngine.genSetAccountLinkStatus.mock.calls;

  expect(genSetAccountLinkStatusMockCalls).toHaveLength(1);
  expect(genSetAccountLinkStatusMockCalls[0][0]).toBe(accountLinkID);
  expect(genSetAccountLinkStatusMockCalls[0][1]).toBe(
    'FAILURE / USER_INPUT_REQUEST_IN_BACKGROUND',
  );
});
