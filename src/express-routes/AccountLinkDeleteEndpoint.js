/* @flow */

import Endpoint from './helpers/Endpoint';
import Extractor from './helpers/Extractor';

import performDeleteAccountLink from '../web-service/performDeleteAccountLink';

import type { ID } from 'common/types/core';

export type Request = {|
  +accountLinkID: ID,
|};

export type Response = {};

export default class AccountLinkDeleteEndpoint extends Endpoint<
  Request,
  Response,
> {
  // override
  static path = '/v1/accountLinks/:accountLinkID';

  // override
  static permissions = { type: 'PERMISSION_REQUIRED' };

  // override
  static __calculateRequest(req: Object): Request {
    const accountLinkID = Extractor.extractString(req.params, 'accountLinkID');
    return { accountLinkID };
  }

  async __genResponse(request: Request): Promise<Response> {
    performDeleteAccountLink(request.accountLinkID);
    return {};
  }
}
