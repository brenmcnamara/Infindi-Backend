require('./cli-setup');

const LinkEngine = require('../build/operations/account-link/state-machine/LinkEngine').default;
// eslint-disable-next-line max-len
const LinkStateMachine = require('../build/operations/account-link/state-machine/LinkStateMachine').default;
const YodleeManager = require('../build/yodlee/yodlee-manager');

const BMAC = {
  CHASE: 'bc54e92e-1128-4671-bf5d-0d80af7c011a',
  BANK_OF_AMERICA: 'aa9be048-21c9-488f-9af9-570d59bde24d',
  BARCLAYCARD: '0cbf98e7-3512-436d-8eec-fc580457155d',
  FIDELITY: '5d028a07-e930-4aed-b235-1985bcef6412',
  VANGUARD: '6e1d1bbf-f1e7-4150-911b-64e0785b2237',
  WELLS_FARGO: '76fe9160-a415-4693-b8ff-1ea09153e332',
};

const ALFI = {
  CITI_CREDIT_CARD: '844e2d1b-e66d-43f8-87d5-abaf4627d639',
  FIRST_REPUBLIC: 'b09f9c49-f324-4e4a-a79e-7a4285ba9bf9',
  VANGUARD: '2e740da3-c800-43f4-9d7b-a9b75fbd60ca',
  VANGUARD_RETIREMENT: '4dd72668-d4b7-428c-b1bb-0edc31f3877d',
  WELLS_FARGO: 'abb6f8d2-8847-4b3d-893f-276f2ba94959',
};

const engine = new LinkEngine(ALFI.FIRST_REPUBLIC);
const machine = new LinkStateMachine({
  accountLinkID: ALFI.FIRST_REPUBLIC,
  engine: engine,
  mode: 'FOREGROUND_UPDATE',
  shouldForceLinking: true,
});

YodleeManager.initialize();
machine.initialize();
