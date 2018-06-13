require('./cli-setup');

const LinkEngine = require('../build/operations/account-link/state-machine/LinkEngine').default;
// eslint-disable-next-line max-len
const LinkStateMachine = require('../build/operations/account-link/state-machine/LinkStateMachine').default;
const YodleeManager = require('../build/yodlee/yodlee-manager');

const CHASE = 'bc54e92e-1128-4671-bf5d-0d80af7c011a';
const BARCLAYCARD = '0cbf98e7-3512-436d-8eec-fc580457155d';
const FIDELITY = '5d028a07-e930-4aed-b235-1985bcef6412';

const engine = new LinkEngine(CHASE);
const machine = new LinkStateMachine({
  accountLinkID: CHASE,
  engine: engine,
  mode: 'FOREGROUND_UPDATE',
  shouldForceLinking: true,
});

YodleeManager.initialize();
machine.initialize();
