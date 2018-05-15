/* @flow */

import InitializingLinkState from '../InitializingLinkState';
// import LinkEngine from '../LinkEngine';
import LinkStateMachine from '../LinkStateMachine';

jest.mock('../LinkEngine', () => ({
  genRefetchAccountLink: jest.fn(),
  genRefreshAccountLink: jest.fn(),
  genSetAccountLink: jest.fn(),
  onLinkEvent: jest.fn(),
}));

test('starts at initial link state by default', () => {
  const machine = new LinkStateMachine(
    '0',
    'IN_PROGRESS / INITIALIZING',
    'MANUAL',
  );
  expect(machine.getCurrentState()).toBeInstanceOf(InitializingLinkState);
});
