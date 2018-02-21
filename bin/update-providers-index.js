#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * NOTE: This file is not transformed via babel. Must use
 * syntax this works with the runnning version of node.
 */

const AlgoliaSearch = require('algoliasearch');
const FirebaseAdmin = require('firebase-admin');

const chalk = require('chalk');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

console.log(chalk.blue('Configuring environment variables...'));
dotenv.config();

console.log(chalk.blue('Configuring Firebase Admin...'));
const serviceCertFilename = path.join(
  __dirname,
  '../firebase-service-cert.json'
);
const serviceCertSerialized = fs.readFileSync(serviceCertFilename).toString();
const serviceCert = JSON.parse(serviceCertSerialized);

FirebaseAdmin.initializeApp({
  credential: FirebaseAdmin.credential.cert(serviceCert),
  databaseURL: process.env.FIREBASE_DB_URL,
});

console.log(chalk.blue('Initializing algolia index...'));
const algolia = AlgoliaSearch(
  process.env.ALGOLIA_APP_ID,
  process.env.ALGOLIA_API_KEY,
);

const index = algolia.initIndex('Providers');

console.log(chalk.blue('Fetching providers from firebase'));

FirebaseAdmin.firestore()
  .collection('Providers')
  .where('quirkCount', '==', 0)
  .where('sourceOfTruth.value.authType', '==', 'CREDENTIALS')
  .get()
  .then(snapshot => {
    console.log(chalk.blue('Uploading data to algolia...'));
    const providers = [];
    snapshot.docs.forEach(doc => {
      if (!doc.exists) {
        return;
      }
      const provider = doc.data();
      provider.objectID = provider.id;
      provider.createdAt = Math.floor(provider.createdAt.getTime() / 1000);
      provider.updatedAt = Math.floor(provider.updatedAt.getTime() / 1000);
      providers.push(provider);
    });
    return index.saveObjects(providers);
  })
  .then(() => {
    console.log(chalk.green('Done uploading!'));
    process.exit(0);
  })
  .catch(error => {
    console.log(chalk.red(error.toString()));
    process.exit(1);
  });
