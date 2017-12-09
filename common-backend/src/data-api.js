/* @flow */

/**
 * This module is a light abstraction of the core datastore for Infindi,
 * tailored for use in the backend. This is not a full abstraction and is
 * not expected to be used as a complete alternative to Firebase, but simplifies
 * some of the common logic when talking to Firebase.
 */

import invariant from 'invariant';

import type { ID } from 'common/src/types/core';

export type Document<TData: Object> = {
  +exists: boolean,
  +data: () => TData,
};

export type Snapshot<TData: Object> = {
  +docs: Array<Document<TData>>,
};

let FirebaseAdmin: ?Object = null;

function initialize(admin: Object): void {
  FirebaseAdmin = admin;
}

/**
 * Takes a database call that returns a promise and ensures the error is
 * correctly configured.
 */
function transformError<T: Document<*> | Snapshot<*>>(
  promise: Promise<T>,
): Promise<T> {
  return promise.catch(firebaseError => {
    const errorCode = firebaseError.code;
    const errorMessage = firebaseError.message;
    throw { errorCode, errorMessage };
  });
}

/**
 * Throws an error if the firebase document does not exist.
 */
function throwIfDocDoesNotExist<T: Object>(
  promise: Promise<Document<T>>,
): Promise<Document<T>> {
  return promise.then(doc => {
    if (!doc.exists) {
      throw {
        errorCode: 'infindi/resource-not-found',
        errorMessage: `Document does not exist`,
      };
    }
    return doc;
  });
}

/**
 * Some docs require long-running processes to update. If we have multiple
 * worker instances all ready to run the update process, we don't want all of
 * them to be doing the same exact work. To avoid this, workers must register
 * for a "claim" of the resource. The worker instance that wins the claim has
 * the permission to go ahead and perform the necessary updates.
 */
async function genClaimDoc(collection: string, docID: ID): Promise<boolean> {
  return Promise.resolve(false);
}

export default {
  genClaimDoc,
  initialize,
  throwIfDocDoesNotExist,
  transformError,
};

// -----------------------------------------------------------------------------
//
// UTILITIES
//
// -----------------------------------------------------------------------------

function getDatabase(): Object {
  invariant(
    FirebaseAdmin,
    'data-api is not yet initialized. Must initialize before using.',
  );
  return FirebaseAdmin.firestore();
}
