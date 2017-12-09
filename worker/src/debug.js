/* @flow */

import invariant from 'invariant';

function failDuringPlaidDownloadRequest(): bool {
  const shouldFail =
    process.env.WORKERS_TEST_FAIL_DURING_PLAID_DOWNLOAD_REQUEST === 'true';
  const isPlaidInSandboxMode = process.env.PLAID_ENV === 'sandbox';
  invariant(
    !shouldFail || isPlaidInSandboxMode,
    'Should not be debugging download failures while plaid is not in sandbox mode',
  );
  return shouldFail;
}

function silentFailDuringPlaidDownloadRequest(): bool {
  const shouldFail =
    process.env.WORKERS_TEST_SILENT_FAIL_DURING_PLAID_DOWNLOAD_REQUEST ===
    'true';
  const isPlaidInSandboxMode = process.env.PLAID_ENV === 'sandbox';
  invariant(
    !shouldFail || isPlaidInSandboxMode,
    'Should not be debugging download failures while plaid is not in sandbox mode',
  );
  return shouldFail;
}

export default {
  failDuringPlaidDownloadRequest,
  silentFailDuringPlaidDownloadRequest,
};
