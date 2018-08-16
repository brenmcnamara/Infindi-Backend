/* @flow */

import FindiError from 'common/lib/FindiError';
import UserInfo from 'common/lib/models/UserInfo';
import YodleeCredentials from 'common/lib/models/YodleeCredentials';
import YodleeCredentialsFetcher from 'common/lib/models/YodleeCredentialsFetcher';

import type { ModelCollectionQuery } from 'common/lib/models/Model';
import type { SignUpForm } from 'common/lib/models/Auth';

const TEST_YODLEE_CREDENTIALS = [
  { loginName: 'sbMembrenmcnamara1', password: 'sbMembrenmcnamara1#123' },
  { loginName: 'sbMembrenmcnamara2', password: 'sbMembrenmcnamara2#123' },
  { loginName: 'sbMembrenmcnamara3', password: 'sbMembrenmcnamara3#123' },
  { loginName: 'sbMembrenmcnamara4', password: 'sbMembrenmcnamara4#123' },
  { loginName: 'sbMembrenmcnamara5', password: 'sbMembrenmcnamara5#123' },
];

/**
 * When this function is finished executing, a user will be created and
 * persisted in the datastore.
 */
async function genSignUpUser(form: SignUpForm): Promise<UserInfo> {
  // TODO: This function assumed we are in sandbox mode and needs to be
  // rewritten once we are out of sandbox mode.

  // Figure out which test yodlee credentials are still available.
  // eslint-disable-next-line max-len
  const queryAllYodleeCredentials: ModelCollectionQuery = YodleeCredentials.FirebaseCollectionUNSAFE.get();
  const usedYodleeCredentials = await YodleeCredentialsFetcher.genCollectionQuery(
    queryAllYodleeCredentials,
  );

  const availableYodleeTestCredentials = TEST_YODLEE_CREDENTIALS.filter(
    raw =>
      !usedYodleeCredentials.some(creds => raw.loginName === creds.loginName),
  );

  if (availableYodleeTestCredentials.length === 0) {
    throw FindiError.fromRaw({
      errorCode: 'CORE / ASSERTION_FAILURE',
      errorMessage: 'No more yodlee credentials can be allocated',
    });
  }

  const yodleeCredentials = YodleeCredentials.fromRaw(
    availableYodleeTestCredentials[0],
  );
}

export default genSignUpUser;
