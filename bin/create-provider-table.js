
/* eslint-disable no-console */

require('./cli-setup');

const FirebaseAdmin = require('firebase-admin');

const fs = require('fs');
const path = require('path');

const FILENAME = path.join(__dirname, '..', 'provider-table.csv');

Promise.resolve()
  .then(() => {
    console.log('Fetching providers...');
    return genFetchProviders();
  })
  .then(providers => {
    console.log('Writing to file...');
    let serialized = `${getFileHeader()}\n`;
    providers.forEach(provider => {
      serialized += `${serializeProvider(provider)}\n`;
    });
    fs.writeFileSync(FILENAME, serialized);
    console.log('done');
    process.exit(0);
  })
  .catch(error => {
    console.log(error);
    process.exit(1);
  });

function getFileHeader() {
  return 'id,name,url,authType,oAutSite';
}

function serializeProvider(provider) {
  const yodleeProvider = provider.sourceOfTruth.value;
  // eslint-disable-next-line max-len
  return `${provider.id},${yodleeProvider.name},${yodleeProvider.baseUrl},${yodleeProvider.authType},${yodleeProvider.oAuthSite}`;
}

function genFetchProviders() {
  return FirebaseAdmin.firestore()
    .collection('Providers')
    .where('sourceOfTruth.value.languageISOCode', '==', 'EN')
    .get()
    .then(snapshot => {
      const providers = snapshot.docs.map(doc => doc.data());
      return providers;
    });
}
