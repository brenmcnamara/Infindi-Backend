/* @flow */

import type { ID } from 'common/types/core';

export type ExpressRouteHandler = (req: any, res: any, next: Function) => any;

export type RequestAuthentication = {|
  +userID: ID,
|};

export type Permissions =
  | {| +type: 'NO_PERMISSION_REQUIRED' |}
  | {| +type: 'PERMISSION_REQUIRED' |};
