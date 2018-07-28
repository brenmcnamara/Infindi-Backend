/* @flow */

import AccountLinkTestUtils from '../operations/account-link/test-utils';
import Provider from 'common/lib/models/Provider';
import ProviderFetcher from 'common/lib/models/ProviderFetcher';
import UserInfoFetcher from 'common/lib/models/UserInfoFetcher';

import type { RequestAuthentication } from '../express-routes/helpers/types';

const PROVIDER_IDS = [
  '643', // CHASE
  '5', // WELLS FARGO
  '12938', // CITI CARDS
  '1603', // CITI BANKING
  '7000', // CAPITAL ONE
  '458', // FIRST REPUBLIC
  '20719', // MORGAN STANLEY
  '10710', // DISCOVER
  '12171', // LENDING CLUB
  '12', // AMERICAN EXPRESS
  '10017', // BARCLAYCARD US
  '98', // Vanguard
  '2852', // Bank of America
  '21', // Charles Schwab
  '15052', // Technology Credit Union
  '13843', // Optum Bank
  '2162', // PNC Bank
  '3278', // USAA
  '492', // FIDELITY
  '291', // TD Ameritrade
  '18061', // GS Bank / Marcus
  '9565', // Ally Bank
  '2383', // SunTrust Bank
  '4132', // TD BANK
  '19632', // Navient
  '3589', // Sallie Mae
  '9749', // Prosper
  '12944', // LightStream
  '13960', // HSBC USA
  '3531', // Paypal
];

let _providers: Array<Provider> = [];

export default (async function genQueryProviders(
  auth: RequestAuthentication,
  search: string,
  limit: number,
  page: number,
): Promise<Array<Provider>> {
  const { userID } = auth;

  const [user, providers] = await Promise.all([
    UserInfoFetcher.genNullthrows(userID),
    genFetchAndCacheAllProviders(),
  ]);

  const { isTestUser } = user;
  const prependedProvider = isTestUser
    ? [AccountLinkTestUtils.createTestProvider()]
    : [];

  return prependedProvider.concat(
    limit === Infinity
      ? providers.filter(isProviderSupported)
      : providers.filter(isProviderSupported).slice(page * limit, limit),
  );
});

async function genFetchAndCacheAllProviders(): Promise<Array<Provider>> {
  if (_providers.length > 0) {
    return _providers;
  }

  const providers = await Promise.all(
    PROVIDER_IDS.map(providerID => ProviderFetcher.genNullthrows(providerID)),
  );

  _providers = providers;
  return _providers;
}

function isProviderSupported(provider: Provider): boolean {
  if (provider.quirkCount > 0) {
    return false;
  }
  return (
    provider.sourceOfTruth.type !== 'YODLEE' ||
    provider.sourceOfTruth.value.authType === 'CREDENTIALS' ||
    provider.sourceOfTruth.value.authType === 'MFA_CREDENTIALS'
  );
}
