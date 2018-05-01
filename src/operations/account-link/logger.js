/* @flow */

import FirebaseAdmin from 'firebase-admin';

import uuid from 'uuid/v4';

import { createPointer } from 'common/lib/db-utils';
import { ERROR } from '../../log-utils';

import type {
  AccountLink,
  AccountLinkStatus,
} from 'common/lib/models/AccountLink';
import type { ID, ModelStub, Pointer } from 'common/types/core';

type LinkAttempt = ModelStub<'LinkAttempt'> & {
  accountLinkRef: Pointer<'AccountLink'>,
  isRunning: boolean,
  linkType: 'AUTO' | 'MANUAL',
  providerName: string,
  status: AccountLinkStatus,
  userRef: Pointer<'User'>,
};

async function genStart(
  accountLink: AccountLink,
  linkType: 'AUTO' | 'MANUAL',
): Promise<void> {
  swallowLoggingErrors(async () => {
    const linkAttempt = createLinkAttempt(accountLink, linkType);
    await genSetLinkAttempt(linkAttempt);
  });
}

async function genUpdate(accountLink: AccountLink): Promise<void> {
  swallowLoggingErrors(async () => {
    let linkAttempt = await genFetchRunningLinkAttempt(accountLink.id);
    if (!linkAttempt) {
      // NOTE: Not erroring in the logger.
      return;
    }
    linkAttempt = updateLinkAttempt(linkAttempt, accountLink, true);
    await genSetLinkAttempt(linkAttempt);
  });
}

async function genStop(accountLink: AccountLink): Promise<void> {
  swallowLoggingErrors(async () => {
    let linkAttempt = await genFetchRunningLinkAttempt(accountLink.id);
    if (!linkAttempt) {
      // NOTE: Silently fail.
      return;
    }
    linkAttempt = updateLinkAttempt(linkAttempt, accountLink, false);
    await genSetLinkAttempt(linkAttempt);
  });
}

export default {
  genStart,
  genStop,
  genUpdate,
};

function genFetchRunningLinkAttempt(
  accountLinkID: ID,
): Promise<LinkAttempt | null> {
  return getLinkAttemptCollection()
    .where('accountLinkRef.refID', '==', accountLinkID)
    .where('isRunning', '==', true)
    .get()
    .then(
      snapshot =>
        snapshot.docs[0] && snapshot.docs[0].exists
          ? snapshot.docs[0].data()
          : null,
    );
}

function genSetLinkAttempt(linkAttempt: LinkAttempt): Promise<void> {
  return getLinkAttemptCollection()
    .doc(linkAttempt.id)
    .set(linkAttempt);
}

function createLinkAttempt(
  accountLink: AccountLink,
  linkType: 'AUTO' | 'MANUAL',
): LinkAttempt {
  const now = new Date();
  const id = uuid();
  return {
    accountLinkRef: createPointer('AccountLink', accountLink.id),
    createdAt: now,
    id,
    isRunning: true,
    linkType,
    modelType: 'LinkAttempt',
    providerName: accountLink.providerName,
    status: accountLink.status,
    type: 'MODEL',
    updatedAt: now,
    userRef: accountLink.userRef,
  };
}

function updateLinkAttempt(
  linkAttempt: LinkAttempt,
  accountLink: AccountLink,
  isRunning: boolean,
): LinkAttempt {
  const now = new Date();
  return {
    ...linkAttempt,
    isRunning,
    status: accountLink.status,
    updatedAt: now,
  };
}

function getLinkAttemptCollection() {
  return FirebaseAdmin.firestore().collection('LinkAttempts');
}

function swallowLoggingErrors(cb: () => Promise<*>) {
  return cb().catch(error => {
    ERROR('ACCOUNT-LINK', `Logger threw error: ${error.toString()}`);
  });
}
