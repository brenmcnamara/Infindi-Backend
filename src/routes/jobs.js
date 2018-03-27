/* @flow */

import * as FirebaseAdmin from 'firebase-admin';

import express from 'express';

import { genUpdateLinksForUser } from '../operations/account-link-update';
import { handleError } from '../route-utils';

import type { RouteHandler } from '../middleware';
import type { UserInfo } from 'common/lib/models/UserInfo';

const router = express.Router();

export default router;

export function initialize(): void {}

// -----------------------------------------------------------------------------
//
// GET /jobs/updateAllLinks
//
// -----------------------------------------------------------------------------

function performUpdateAllLinks(): RouteHandler {
  return handleError(async (req, res) => {
    const users = await genFetchUsers();
    await Promise.all(users.map(user => genUpdateLinksForUser(user.id)));
    res.json({ status: 'DONE' });
  }, true);
}

router.get('/updateAllLinks', performUpdateAllLinks());

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function genFetchUsers(): Promise<Array<UserInfo>> {
  return FirebaseAdmin.firestore()
    .collection('UserInfo')
    .get()
    .then(snapshot =>
      snapshot.docs.filter(doc => doc.exists).map(doc => doc.data()),
    );
}
