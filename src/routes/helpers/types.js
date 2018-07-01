/* @flow */

import type { ID } from 'common/types/core';

export type RouteHandler = (req: any, res: any, next: Function) => any;

export type Request<TParams: Object, TQuery: Object, TBody: Object> = {
  body: TBody,
  params: TParams,
  query: TQuery,
};

export type RequestAuthentication = {|
  +userID: ID,
|};

// eslint-disable-next-line flowtype/generic-spacing
export type GetRequest<TParams: Object, TQuery: Object> = Request<
  TParams,
  TQuery,
  {||},
>;

export type Response<TBody: Object> = {
  body: TBody,
};

export type Permissions =
  | {| +type: 'NO_PERMISSION_REQUIRED' |}
  | {| +type: 'PERMISSION_REQUIRED' |};
