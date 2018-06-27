/* eslint-disable no-console */

require('./cli-setup');

const AccountLinkOperations = require('../build/operations/account-link').default;

const ACCOUNT_LINK_ID = 'ea485d0b-aba4-4a6e-9f46-638a3bcee7fd';

AccountLinkOperations.performDeleteLink(ACCOUNT_LINK_ID);
