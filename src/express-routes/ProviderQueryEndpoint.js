/* @flow */

import Endpoint from './helpers/Endpoint';
import Extractor from './helpers/Extractor';
import Provider from 'common/lib/models/Provider';

import genQueryProviders from '../web-service/genQueryProviders';

import type { ProviderRaw } from 'common/lib/models/Provider';

export type Request = {
  limit: number,
  page: number,
  search: string,
};

export type Response = {
  providers: Array<ProviderRaw>,
};

export default class ProviderQueryEndpoint extends Endpoint<Request, Response> {
  _providers: Array<Provider> = [];

  // override
  static path = '/v1/providers/query';

  // override
  static permissions = { type: 'PERMISSION_REQUIRED' };

  // override
  static __calculateRequestForExpressRequest(req: Object): Request {
    const limit =
      Extractor.extractOptionalNumber(req.query, 'limit') || Infinity;
    const page = Extractor.extractOptionalNumber(req.query, 'page') || 0;
    const search = Extractor.extractOptionalString(req.query, 'search') || '';

    return { limit, page, search };
  }

  // override
  async __genResponse(request: Request): Promise<Response> {
    const providers = await genQueryProviders(
      this.__getAuthentication(),
      request.search,
      request.limit,
      request.page,
    );

    return { providers: providers.map(p => p.toRaw()) };
  }
}
