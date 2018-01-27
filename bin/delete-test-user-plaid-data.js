#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * NOTE: This file is not transformed via babel. Must use
 * syntax this works with the runnning version of node.
 */

const Firebase = require('Firebase');
const FirebaseAdmin = require('firebase-admin');

const chalk = require('chalk');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');


console.log('Configuring environment variables...');
dotenv.config();

console.log('Initializing Firebase Client...');
Firebase.initializeApp({
  apiKey: process.env.FIREBASE_WEB_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DB_URL,
  storageBucket: process.env.FIREBASE_STORAGE,
});

console.log('Configuring Firebase Admin...');
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

const Database = FirebaseAdmin.firestore();

let uid;

const deleteBatch = Database.batch();

const email = process.env.FIREBASE_TEST_USER_EMAIL;
const password = process.env.FIREBASE_TEST_USER_PASSWORD;

Firebase.auth()
  .signInWithEmailAndPassword(email, password)
  .then(firebaseUser => {
    console.log(chalk.green('Validated test user credentials'));
    if (!firebaseUser) {
      throw Error('Failed to login user');
    }
    uid = firebaseUser.uid;
    return Database.collection('Transactions')
      .where('userRef.refID', '==', uid)
      .where('sourceOfTruth.type', '==', 'PLAID')
      .get();
  })
  .then(snapshot => {
    console.log(
      chalk.green(`Fetched ${snapshot.docs.length} transactions to delete`)
    );
    snapshot.docs.forEach(document => {
      if (!document.exists) {
        return;
      }
      const transaction = document.data();
      const ref = Database.collection('Transactions').doc(transaction.id);
      deleteBatch.delete(ref);
    });
    return Database
      .collection('Accounts')
      .where('userRef.refID', '==', uid)
      .where('sourceOfTruth.type', '==', 'PLAID')
      .get();
  })
  .then(snapshot => {
    console.log(
      chalk.green(`Fetch ${snapshot.docs.length} Accounts to delete`)
    );
    snapshot.docs.forEach(document => {
      if (!document.exists) {
        return;
      }
      const account = document.data();
      const ref = Database.collection('Accounts').doc(account.id);
      deleteBatch.delete(ref);
    });
    return Database
      .collection('PlaidCredentials')
      .where('userRef.refID', '==', uid)
      .get();
  })
  .then(snapshot => {
    console.log(
      chalk.green(`Fetch ${snapshot.docs.length} PlaidCredentials to delete`)
    );
    snapshot.docs.forEach(document => {
      if (!document.exists) {
        return;
      }
      const credentials = document.data();
      const ref = Database.collection('PlaidCredentials').doc(credentials.id);
      deleteBatch.delete(ref);
    });
    console.log(chalk.green('Running deletion'));
    return deleteBatch.commit();
  })
  .then(() => {
    console.log(chalk.green('Successfully deleted!'));
    process.exit(0);
  })
  .catch(error => {
    console.log(chalk.red(error.toString()));
    process.exit(1);
  });
