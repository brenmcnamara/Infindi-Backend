/* @flow */

import Extractor from './helpers/Extractor';
import GetEndpoint from './helpers/GetEndpoint';
import Provider from 'common/lib/models/Provider';
import ProviderFetcher from 'common/lib/models/ProviderFetcher';

import type { GetRequest, Response as ResponseTemplate } from './helpers/types';
import type { ProviderRaw } from 'common/lib/models/Provider';

export type Request = GetRequest<RequestParams, RequestQuery>;

export type Response = ResponseTemplate<ResponseBody>;

type RequestParams = {};

type RequestQuery = {|
  +limit: number,
  +page: number,
  +search: string,
|};

type ResponseBody = {
  providers: Array<ProviderRaw>,
};

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

export default class ProviderSearchEndpoint extends GetEndpoint<
  Request,
  Response,
> {
  _providers: Array<Provider> = [];

  // override
  static path = '/v1/providers/search';

  // override
  static permissions = { type: 'PERMISSION_REQUIRED' };

  // override
  static __calculateRequestForExpressRequest(req: Object): Request {
    const limit =
      Extractor.extractOptionalNumber(req.query, 'limit') || Infinity;
    const page = Extractor.extractOptionalNumber(req.query, 'page') || 0;
    const search = Extractor.extractOptionalString(req.query, 'search') || '';

    const query = { limit, page, search };
    const params = {};
    return {
      body: {},
      query,
      params,
    };
  }

  // override
  async __genResponse(request: Request): Promise<Response> {
    const providers = await this._genFetchAndCacheAllProviders();
    const providersSubset =
      request.query.limit === Infinity
        ? providers.filter(isProviderSupported)
        : providers
            .filter(isProviderSupported)
            .slice(
              request.query.page * request.query.limit,
              request.query.limit,
            );

    const body = {
      providers: providersSubset.map(p => p.toRaw()),
    };

    return { body };
  }

  async _genFetchAndCacheAllProviders(): Promise<Array<Provider>> {
    if (this._providers.length > 0) {
      return this._providers;
    }

    const providers = await Promise.all(
      PROVIDER_IDS.map(providerID => ProviderFetcher.genNullthrows(providerID)),
    );

    this._providers = providers;
    return this._providers;
  }
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
