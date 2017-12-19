/* @flow */

export const LogGroup = {
  INITIALIZATION: 'INITIALIZATION',
  LITMUS: 'LITMUS',
  METRICS: 'METRICS',
  PLAID: 'PLAID',
  SESSION: 'SESSION',
};

export type LogGroupType = $Keys<typeof LogGroup>;

export const DEBUG = log.bind(null, 'DEBUG');

export const INFO = log.bind(null, 'INFO');

export const WARNING = log.bind(null, 'WARNING');

export const ERROR = log.bind(null, 'ERROR');

function log(severity: string, group: LogGroupType, message: string): void {
  // eslint-disable-next-line no-console
  console.log(`{${severity}}\t[${group}]: ${message}`);
}
