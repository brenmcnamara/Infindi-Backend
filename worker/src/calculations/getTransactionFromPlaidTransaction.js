/* @flow */

import type { PlaidCredentials } from 'common/lib/models/PlaidCredentials';
import type {
  PlaidDate,
  Transaction as Plaid$Transaction,
} from 'common/types/plaid';
import type { Transaction } from 'common/lib/models/Transaction';

export default function getTransactionFromPlaidTransaction(
  plaidTransaction: Plaid$Transaction,
  credentials: PlaidCredentials,
): Transaction {
  const now = new Date();
  const category =
    plaidTransaction.category && plaidTransaction.category.length > 0
      ? plaidTransaction.category[plaidTransaction.category.length - 1]
      : null;
  const transaction: Transaction = {
    accountRef: {
      pointerType: 'Account',
      type: 'POINTER',
      refID: plaidTransaction.account_id,
    },
    amount: plaidTransaction.amount,
    category,
    createdAt: now,
    id: plaidTransaction.transaction_id,
    modelType: 'Transaction',
    name: plaidTransaction.name,
    sourceOfTruth: {
      type: 'PLAID',
      value: plaidTransaction,
    },
    transactionDate: getUTCDate(plaidTransaction.date),
    type: 'MODEL',
    updatedAt: now,
    userRef: credentials.userRef,
  };
  return transaction;
}

function getUTCDate(plaidDate: PlaidDate): Date {
  const [yearFormatted, monthFormatted, dayFormatted] = plaidDate.split('-');
  const year = parseInt(yearFormatted, 10);
  const month = parseInt(monthFormatted, 10);
  const day = parseInt(dayFormatted, 10);
  return new Date(Date.UTC(year, month, day));
}
