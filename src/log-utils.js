/* @flow */

import chalk from 'chalk';

export const DEBUG = log.bind(null, 'DEBUG');

export const INFO = log.bind(null, 'INFO');

export const WARNING = log.bind(null, 'WARNING');

export const ERROR = log.bind(null, 'ERROR');

function log(severity: string, group: string, message: string): void {
  const formatted = `{${severity}}\t[${group}]: ${message}`;
  if (process.env.COLORED_LOGS === 'true') {
    const color = getColor(severity);
    // $FlowFixMe - Fix this later.
    const chalkLog = chalk[color];
    // eslint-disable-next-line no-console
    console.log(chalkLog(formatted));
    return;
  }
  // eslint-disable-next-line no-console
  console.log(formatted);
}

function getColor(severity: string): string {
  switch (severity) {
    case 'DEBUG':
      return 'blue';
    case 'INFO':
      return 'green';
    case 'WARNING':
      return 'yellow';
    case 'ERROR':
      return 'red';
    default:
      return 'green';
  }
}
