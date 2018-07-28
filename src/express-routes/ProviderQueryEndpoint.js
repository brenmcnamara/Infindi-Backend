/* @flow */

import Endpoint from './helpers/Endpoint';
import Extractor from './helpers/Extractor';
import Provider from 'common/lib/models/Provider';

import genQueryProviders from '../web-service/genQueryProviders';

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

export default class ProviderQueryEndpoint extends Endpoint<
  Request,
  Response,
> {
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
    const providers = await genQueryProviders(
      this.__getAuthentication(),
      request.query.search,
      request.query.limit,
      request.query.page,
    );

    const body = {
      providers: providers.map(p => p.toRaw()),
    };

    return { body };
  }
}
