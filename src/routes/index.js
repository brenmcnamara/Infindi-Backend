/* @flow */

import ProviderLoginFormEndpoint from './ProviderLoginFormEndpoint';
import ProviderMFAFormEndpoint from './ProviderMFAFormEndpoint';
import ProviderSearchEndpoint from './ProviderSearchEndpoint';
import UserCreateEndpoint from './UserCreateEndpoint';

import express from 'express';

import type Endpoint from './helpers/Endpoint';

const router = express.Router();

export default router;

export function initialize(): void {
  ExpressAdapter.createPostEndpoint(ProviderLoginFormEndpoint);
  ExpressAdapter.createPostEndpoint(ProviderMFAFormEndpoint);
  ExpressAdapter.createGetEndpoint(ProviderSearchEndpoint);
  ExpressAdapter.createPostEndpoint(UserCreateEndpoint);
}

const ExpressAdapter = {
  createGetEndpoint(EndpointCtor: Class<Endpoint<any, any>>) {
    const endpoint = new EndpointCtor();
    router.get(EndpointCtor.path, endpoint.getHandle());
  },

  createPostEndpoint(EndpointCtor: Class<Endpoint<any, any>>) {
    const endpoint = new EndpointCtor();
    router.post(EndpointCtor.path, endpoint.getHandle());
  },
};
