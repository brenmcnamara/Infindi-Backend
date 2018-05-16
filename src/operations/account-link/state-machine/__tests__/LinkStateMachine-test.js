import InitializingState from '../InitializingState';
import LinkEngine from '../LinkEngine';
import LinkStateMachine from '../LinkStateMachine';
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

const MOCK_EVENT = {
  pendingLogin: {
    accountLinkID: '0',
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
    type: 'UPDATE_YODLEE_PROVIDER_ACCOUNT',
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
