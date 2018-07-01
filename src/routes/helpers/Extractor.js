/* @flow */

import FindiError from 'common/lib/FindiError';

function extractNumber(obj: Object, key: string): number {
  const value = extractOptionalNumber(obj, key);
  if (value === null) {
    throw FindiError.fromRaw({
      errorCode: 'CORE / INVALID_ARGUMENT',
      errorMessage: `Expecting object to contain property "${key}" that can be parsed to a number`,
    });
  }
  return value;
}

function extractOptionalNumber(obj: Object, key: string): number | null {
  const value = obj[key];
  if (value === null || value === undefined) {
    return null;
  }

  const parsedValue = parseInt(value);
  if (typeof parsedValue !== 'number' || Number.isNaN(parsedValue)) {
    throw FindiError.fromRaw({
      errorCode: 'CORE / INVALID_ARGUMENT',
      // eslint-disable-next-line max-len
      errorMessage: `Expecting object to contain property "${key}" that can be parsed to a number: ${
        obj[key]
      }`,
    });
  }
  return parsedValue;
}

function extractString(obj: Object, key: string): string {
  const value = extractOptionalString(obj, key);
  if (value === null) {
    throw FindiError.fromRaw({
      errorCode: 'CORE / INVALID_ARGUMENT',
      errorMessage: `Expecting object to contain property "${key}" of type string`,
    });
  }
  return value;
}

function extractOptionalString(obj: Object, key: string): string | null {
  const value = obj[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw FindiError.fromRaw({
      errorCode: 'CORE / INVALID_ARGUMENT',
      errorMessage: `Expecting object to contain property "${key}" of type string: ${
        obj[key]
      }`,
    });
  }
  return value;
}

export default {
  extractNumber,
  extractOptionalNumber,
  extractOptionalString,
  extractString,
};
