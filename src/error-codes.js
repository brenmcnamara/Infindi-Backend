/* @flow */

import { type ErrorResponse as PlaidErrorResponse } from './types/plaid';

export type Error = { errorCode: string, errorMessage: string };

// Infindi
export type ErrorCode =
  // Get argument-error when using invalid itemID with firebase.
  | 'auth/argument-error'
  | 'auth/disabled'
  | 'auth/insufficient-permission'
  | 'auth/invalid-credential'
  | 'auth/user-disabled'
  | 'auth/user-not-found'
  | 'auth/wrong-password'
  | 'infindi/bad-request'
  | 'infindi/not-authenticated'
  | 'infindi/resource-not-found'
  | 'infindi/server-error'
  | 'plaid/invalidInput/invalidPublicToken'
  | 'plaid/unknownError';

const ERROR_CODE_400 = ['auth/invalid-email'];

const ERROR_CODE_401 = [
  'auth/argument-error',
  'auth/disabled',
  'auth/insufficient-permission',
  'auth/invalid-credential',
  'auth/user-disabled',
  'auth/user-not-found',
  'auth/wrong-password',
  'plaid/invalidPublicToken',
];

const ERROR_CODE_404 = ['infindi/resource-not-found'];

export function getStatusForErrorCode(code: string): number {
  if (ERROR_CODE_400.includes(code)) {
    return 400;
  } else if (ERROR_CODE_401.includes(code)) {
    return 401;
  } else if (ERROR_CODE_404.includes(code)) {
    return 404;
  }
  return 500;
}

export function getErrorForPlaidError(plaidError: PlaidErrorResponse): Error {
  // flatten the type / code hierarchy so we can handle everything in one
  // branch.
  const plaidErrorType = `${plaidError.error_type}/${plaidError.error_code}`;
  switch (plaidErrorType) {
    case 'INVALID_INPUT/INVALID_PUBLIC_TOKEN':
      return {
        errorCode: 'plaid/invalidInput/invalidPublicToken',
        errorMessage: plaidError.error_message,
      };
    default:
      return {
        errorCode: 'plaid/unknownError',
        errorMessage: plaidError.error_message,
      };
  }
}
