/* @flow */

// Infindi
export type ErrorCode =
  | 'auth/disabled'
  | 'auth/insufficient-permission'
  | 'auth/invalid-credential'
  | 'auth/user-disabled'
  | 'auth/user-not-found'
  | 'auth/wrong-password'
  | 'infindi/bad-request'
  | 'infindi/not-authenticated'
  | 'infindi/server-error';

const ERROR_CODE_400 = ['auth/invalid-email'];

const ERROR_CODE_401 = [
  'auth/wrong-password',
  'auth/user-not-found',
  'auth/user-disabled',
  'auth/disabled',
  'auth/invalid-credential',
  'auth/insufficient-permission',
];

export function getStatusForErrorCode(code: string): number {
  if (ERROR_CODE_400.includes(code)) {
    return 400;
  } else if (ERROR_CODE_401.includes(code)) {
    return 401;
  }
  return 500;
}
