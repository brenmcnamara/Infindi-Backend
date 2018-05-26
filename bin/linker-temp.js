require('./cli-setup');

const LinkEngine = require('../build/operations/account-link/state-machine/LinkEngine').default;
// eslint-disable-next-line max-len
const LinkStateMachine = require('../build/operations/account-link/state-machine/LinkStateMachine').default;

const CHASE = 'bc54e92e-1128-4671-bf5d-0d80af7c011a';

const engine = new LinkEngine(CHASE);
const machine = new LinkStateMachine(CHASE, 'AUTO', engine);

machine.initialize();
