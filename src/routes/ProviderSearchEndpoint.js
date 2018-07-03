/* @flow */

import Endpoint from './helpers/Endpoint';
import Extractor from './helpers/Extractor';
import Provider from 'common/lib/models/Provider';

import genFetchProviders from '../web-service/genFetchProviders';

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

export default class ProviderSearchEndpoint extends Endpoint<
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
    const providers = await genFetchProviders(
      this.__getAuthentication(),
      request.query.limit,
      request.query.page,
      request.query.search,
    );

    const body = {
      providers: providers.map(p => p.toRaw()),
    };

    return { body };
  }
}
