require('./cli-setup');

const LinkEngine = require('../build/operations/account-link/state-machine/LinkEngine').default;
// eslint-disable-next-line max-len
const LinkStateMachine = require('../build/operations/account-link/state-machine/LinkStateMachine').default;
const YodleeManager = require('../build/yodlee/yodlee-manager');

const CHASE = 'bc54e92e-1128-4671-bf5d-0d80af7c011a';
const BANK_OF_AMERICA = 'aa9be048-21c9-488f-9af9-570d59bde24d';
const BARCLAYCARD = '0cbf98e7-3512-436d-8eec-fc580457155d';
const FIDELITY = '5d028a07-e930-4aed-b235-1985bcef6412';
const VANGUARD = '6e1d1bbf-f1e7-4150-911b-64e0785b2237';
const WELLS_FARGO = '76fe9160-a415-4693-b8ff-1ea09153e332';

const engine = new LinkEngine(BANK_OF_AMERICA);
const machine = new LinkStateMachine({
  accountLinkID: BANK_OF_AMERICA,
  engine: engine,
  mode: 'FOREGROUND_UPDATE',
  shouldForceLinking: true,
});

YodleeManager.initialize();
machine.initialize();
