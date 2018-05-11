/* eslint-disable no-console */

require('./cli-setup');

const FirebaseAdmin = require('firebase-admin');

const fs = require('fs');
const moment = require('moment');
const path = require('path');

const FILENAME = path.join(__dirname, '..', 'link-attempts.csv');

let attempts;
Promise.resolve()
  .then(() => {
    console.log('Fetching link attempts...');
    return FirebaseAdmin.firestore()
      .collection('LinkAttempts')
      .orderBy('updatedAt', 'desc')
      .get();
  })
  .then(snapshot => {
    attempts = snapshot.docs.map(doc => doc.data());
    console.log('Fetching users...');
    return Promise.all(attempts.map(genUserNameForAttempt));
  })
  .then(userNames => {
    console.log('Serializing results...');
    let serialized = getFileHeader();
    attempts.forEach((attempt, index) => {
      serialized += serializeLinkAttempt(attempt, userNames[index]);
    });
    fs.writeFileSync(FILENAME, serialized);
  })
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.log(error);
    process.exit(1);
  });

function getFileHeader() {
  return 'id,date,status,user,auto/manual,provider,total run time (secs),isRunning\n';
}

function serializeLinkAttempt(attempt, userName) {
  const formattedDate = moment(attempt.updatedAt).format('L');
  const runTimeSecs =
    Math.round((attempt.updatedAt.getTime() - attempt.createdAt.getTime()) / 1000);
  // eslint-disable-next-line max-len
  return `${attempt.id},${formattedDate},${attempt.status},${userName},${attempt.linkType},${attempt.providerName},${runTimeSecs},${attempt.isRunning}\n`;
}

function genUserNameForAttempt(attempt) {
  return FirebaseAdmin.firestore()
    .collection('UserInfo')
    .doc(attempt.userRef.refID)
    .get()
    .then(doc => {
      const userInfo = doc.data();
      return `${userInfo.firstName} ${userInfo.lastName}`;
    });
}
