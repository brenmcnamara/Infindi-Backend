/* @flow */

import Plaid from 'plaid';

import invariant from 'invariant';

import type {
  Account as Plaid$Account,
  PlaidDate,
  Transaction as Plaid$Transaction,
} from 'common/src/types/plaid';
import type { PlaidCredentials } from 'common/src/types/db';

const YEAR_IN_MILLIS = 1000 * 60 * 60 * 24 * 365;

let plaidClient: ?Object = null;

export function initialize(): void {
  plaidClient = new Plaid.Client(
    process.env.PLAID_CLIENT_ID,
    process.env.PLAID_SECRET,
    process.env.PLAID_PUBLIC_KEY,
    Plaid.environments[process.env.PLAID_ENV],
  );
}

export function genPlaidAccounts(
  credentials: PlaidCredentials,
): Promise<Array<Plaid$Account>> {
  return new Promise(resolve => {
    const client = getPlaidClient();
    const { accessToken } = credentials;
    client.getAccounts(accessToken, (error, response) => {
      if (error) {
        const errorCode =
          error.errorCode ||
          error.error_code ||
          error.code ||
          'infindi/server-error';
        const errorMessage =
          error.error_message ||
          error.errorMessage ||
          error.message ||
          error.toString();
        const toString = () => `[${errorCode}]: ${errorMessage}`;
        throw { errorCode, errorMessage, toString };
      }
      resolve(response.accounts);
    });
  });
}

export type TransactionQuery = {
  startDate?: Date,
};

export function genPlaidTransactions(
  credentials: PlaidCredentials,
  query: TransactionQuery = {},
): Promise<Array<Plaid$Transaction>> {
  return new Promise(resolve => {
    const client = getPlaidClient();
    const { accessToken } = credentials;
    const endDate = new Date();
    const startDate =
      query.startDate || new Date(endDate.getTime() - 2 * YEAR_IN_MILLIS);
    const startPlaidDate = getPlaidDate(startDate);
    const endPlaidDate = getPlaidDate(endDate);
    client.getTransactions(
      accessToken,
      startPlaidDate,
      endPlaidDate,
      (error, response) => {
        if (error) {
          const errorCode =
            error.errorCode ||
            error.error_code ||
            error.code ||
            'infindi/server-error';
          const errorMessage =
            error.error_message ||
            error.errorMessage ||
            error.message ||
            error.toString();
          const toString = () => `[${errorCode}]: ${errorMessage}`;
          throw { errorCode, errorMessage, toString };
        }
        const transactions: Array<Plaid$Transaction> = response.transactions;
        resolve(transactions);
      },
    );
  });
}

function getPlaidClient(): Object {
  invariant(
    plaidClient,
    'Plaid client must be initialized before it can be used',
  );
  return plaidClient;
}

function getPlaidDate(date: Date): PlaidDate {
  const day = date.getUTCDate();
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();

  const dayFormatted = day < 10 ? `0${day}` : day.toString();
  const monthFormatted = month < 10 ? `0${month}` : month.toString();
  const yearFormatted = year.toString();

  return `${yearFormatted}-${monthFormatted}-${dayFormatted}`;
}
