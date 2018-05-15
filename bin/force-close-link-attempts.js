/* eslint-disable no-console */

require('./cli-setup');

const FirebaseAdmin = require('firebase-admin');

Promise.resolve()
  .then(() => {
    return FirebaseAdmin.firestore()
      .collection('LinkAttempts')
      .where('isRunning', '==', true)
      .get();
  })
  .then(snapshot => {
    const attempts = snapshot.docs.map(doc => doc.data());
    console.log(`Found ${attempts.length} attempt(s) to force close`);
    const batch = FirebaseAdmin.firestore().batch();
    attempts.forEach(attempt => {
      const ref = FirebaseAdmin.firestore().collection('LinkAttempts').doc(attempt.id);
      batch.set(ref, {...attempt, isRunning: false, didForceClose: true});
    });
    return batch.commit();
  })
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.log('Error:', error.toString());
    process.exit(1);
  });
