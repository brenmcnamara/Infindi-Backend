import InitializingState from '../InitializingState';
import LinkEngine from '../LinkEngine';
import LinkStateMachine from '../LinkStateMachine';

jest.mock('../LinkEngine', () => ({
  genLogEndLinking: jest.fn(),
  genLogStartLinking: jest.fn(),
  genRefetchAccountLink: jest.fn(),
  genRefreshAccountLink: jest.fn(),
  genSetAccountLink: jest.fn(),
  genSetAccountLinkStatus: jest.fn(),
  onLinkEvent: jest.fn(),
}));

beforeEach(() => {
  LinkEngine.genLogEndLinking.mockReset();
  LinkEngine.genLogStartLinking.mockReset();
  LinkEngine.genRefetchAccountLink.mockReset();
  LinkEngine.genRefreshAccountLink.mockReset();
  LinkEngine.genSetAccountLink.mockReset();
  LinkEngine.genSetAccountLinkStatus.mockReset();
  LinkEngine.onLinkEvent.mockReset();
});

test('starts at initial link state by default', () => {
  const machine = new LinkStateMachine('0', 'MANUAL');
  expect(machine.getCurrentState()).toBeInstanceOf(InitializingState);
});

test('will refresh the account after the state machine is initialized', () => {
  const accountLinkID = '0';

  LinkEngine.genRefreshAccountLink.mockReturnValue(Promise.resolve());

  const machine = new LinkStateMachine(accountLinkID, 'MANUAL');
  machine.initialize();

  expect(LinkEngine.genRefreshAccountLink.mock.calls).toHaveLength(1);
  expect(LinkEngine.genRefreshAccountLink.mock.calls[0][0]).toBe(accountLinkID);
});

test('goes to polling state after first refresh is received', () => {});
