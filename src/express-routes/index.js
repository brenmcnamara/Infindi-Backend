/* @flow */

import AccountLinkDeleteEndpoint from './AccountLinkDeleteEndpoint';
import ProviderLoginFormEndpoint from './ProviderLoginFormEndpoint';
import ProviderMFAFormEndpoint from './ProviderMFAFormEndpoint';
import ProviderQueryEndpoint from './ProviderQueryEndpoint';
import UserCreateEndpoint from './UserCreateEndpoint';

import express from 'express';

import type Endpoint from './helpers/Endpoint';

const router = express.Router();

export default router;

export function initialize(): void {
  ExpressAdapter.createDeleteEndpoint(AccountLinkDeleteEndpoint);
  ExpressAdapter.createPostEndpoint(ProviderLoginFormEndpoint);
  ExpressAdapter.createPostEndpoint(ProviderMFAFormEndpoint);
  ExpressAdapter.createGetEndpoint(ProviderQueryEndpoint);
  ExpressAdapter.createPostEndpoint(UserCreateEndpoint);
}

const ExpressAdapter = {
  createDeleteEndpoint(EndpointCtor: Class<Endpoint<any, any>>) {
    const endpoint = new EndpointCtor();
    router.delete(EndpointCtor.path, endpoint.getExpressHandle());
  },

  createGetEndpoint(EndpointCtor: Class<Endpoint<any, any>>) {
    const endpoint = new EndpointCtor();
    router.get(EndpointCtor.path, endpoint.getExpressHandle());
  },

  createPostEndpoint(EndpointCtor: Class<Endpoint<any, any>>) {
    const endpoint = new EndpointCtor();
    router.post(EndpointCtor.path, endpoint.getExpressHandle());
  },
};
