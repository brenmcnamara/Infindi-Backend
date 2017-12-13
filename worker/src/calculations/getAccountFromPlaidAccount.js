/* @flow */

import Common from 'common';

import type { Account, PlaidCredentials } from 'common/src/types/db';
import type { Account as Plaid$Account } from 'common/src/types/plaid';
import type { ModelStub } from 'common/src/types/core';

const { DBUtils } = Common;

function getAccountFromPlaidAccount(
  plaid: Plaid$Account,
  credentials: PlaidCredentials,
): Account {
  const stub: ModelStub<'Account'> = DBUtils.createModelStub('Account');
  const alias = null;
  const balance = plaid.balances.current;
  const credentialsRef = {
    pointerType: 'PlaidCredentials',
    refID: credentials.id,
    type: 'POINTER',
  };
  const id = plaid.account_id;
  const institutionName = getInstitutionName(credentials);
  const name = plaid.name;
  const sourceOfTruth = { type: 'PLAID', value: plaid };
  const userRef = credentials.userRef;

  const newAccount = {
    ...stub,
    alias,
    balance,
    credentialsRef,
    id,
    institutionName,
    name,
    sourceOfTruth,
    userRef,
  };
  return newAccount;
}

export default getAccountFromPlaidAccount;

/**
 * Extract the institution name from the plaid credentials.
 *
 * TODO: Better typing on plaid metadata.
 */
function getInstitutionName(credentials: PlaidCredentials): string {
  return correctInstitutionName(credentials.metadata.institution.name);
}

/**
 * Bank name should be in the following format:
 * (1) All caps
 * (2) No whitespace
 * (3) Bank name with multiple words should seperated with underscores
 *
 * WELLS_FARGO
 * CHASE
 * BANK_OF_AMERICA
 */
function correctInstitutionName(bankName: string): string {
  return bankName
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
}
