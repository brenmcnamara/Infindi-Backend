/* eslint-disable no-console */

require('./cli-setup');

const FirebaseAdmin = require('firebase-admin');

// -----------------------------------------------------------------------------
//
// IMPLEMENT ME
//
// -----------------------------------------------------------------------------

/**
 * If this is a test run, we will go through the motions of downloading the
 * data, calculating the new documents, and validating it, but there will no
 * call to persist to migrated data. Recommended to do a test run before setting
 * this flag to false to actually migrate the data.
 */
const IS_TEST_RUN = true;

/**
 * Include the name of the firebase collection that we are migrating here.
 */
const FIREBASE_COLLECTION = '<NAME OF FIREBASE COLLECTION>';

/**
 * Optionally override this to perform any operations during initialization.
 */
function genInitialize() {
  return Promise.resolve();
}

/**
 * Can optionally skip migrating a particular document if it no migration is needed.
 * This method gets run before trying to calculate the new document.
 */
function genShouldSkipDocument(documentData) {
  return Promise.resolve(false);
}

/**
 * Take a document and calculate the new document to replace the original
 * document.
 */
function genMigrateDocument(documentData) {
  return Promise.reject(Error('genMigrateDocument must be implemented'));
}

// -----------------------------------------------------------------------------
//
// BOILERPLATE
//
// -----------------------------------------------------------------------------

console.log('Initializing Schema Migration...');
genInitialize()
  .then(() => {
    console.log('Done Initializing');
    console.log('Getting documents from firebase collection:', FIREBASE_COLLECTION, '...');
    return FirebaseAdmin.firestore().collection(FIREBASE_COLLECTION).get();
  })
  .then(snapshot => {
    console.log('Fetching documents');
    return Promise.all(snapshot.docs.map(doc => genShouldSkipDocument(doc.data())))
      .then(shouldSkips => {
        console.log('Skipping', shouldSkips.filter(skip => skip).length, 'document update(s)');
        return snapshot.docs.filter((doc, index) => !shouldSkips[index]).map(doc => doc.data());
      });
  })
  .then(newDocumentData => {
    console.log('Migrating', newDocumentData.length, 'documents');
    if (IS_TEST_RUN) {
      console.log('Skipping migration because IS_TEST_RUN is set to true');
      process.exit(0);
    }

    let currentBatch = FirebaseAdmin.firestore().batch();
    const batches = [currentBatch];
    let batchCount = 0;

    newDocumentData.forEach(data => {
      const ref = FirebaseAdmin.firestore().collection(FIREBASE_COLLECTION).doc(data.id);
      currentBatch.set(ref, data);
      batchCount = (batchCount + 1) % 450;

      if (batchCount === 0) {
        currentBatch = FirebaseAdmin.firestore().batch();
        batches.push(currentBatch);
      }
    });

    return Promise.all(batches.map(b => b.commit()));
  })
  .then(() => {
    console.log('Data has successfully migrated!');
    process.exit(0);
  })
  .catch(error => {
    console.log('Unexpected error', error);
    process.exit(1);
  });
