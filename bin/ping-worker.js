#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * NOTE: This file is not transformed via babel. Must use
 * syntax this works with the runnning version of node.
 */

/**
 * Module dependencies.
 */

const CommonBackend = require('common-backend');
const FirebaseAdmin = require('firebase-admin');

const chalk = require('chalk');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const TIMEOUT_MILLIS = 20000;

console.log('Configuring environment variables...');
dotenv.config();

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

CommonBackend.initialize(FirebaseAdmin);

console.log('Pinging worker...');
CommonBackend.Job.genRequestJob('PING', {}).then(pointer => {
  console.log('Worker has been pinged. Waiting to hear back...');
  const jobID = pointer.refID;
  let status = 'UNCLAIMED';

  function onUpdateJob(document) {
    if (!document.exists) {
      // TODO: Should this be an error. Why would we get an update for a job
      // that does not exist?
      return;
    }
    const request = document.data();
    if (request.status === status) {
      return;
    }
    status = request.status;
    switch (status) {
      case 'UNCLAIMED':
        console.log(
          chalk.red('Worker is acting wierd. There is something wrong')
        );
        process.exit(1);
        break;

      case 'RUNNING':
        console.log(chalk.green('Worker is working...'));
        break;

      case 'FAILURE':
        console.log(
          chalk.red('Worker is running, but it threw an error!')
        );
        process.exit(1);
        break;

      case 'COMPLETE':
        console.log(chalk.green('Worker has responded successfully!'));
        process.exit(0);
        break;
    }
  }
  FirebaseAdmin.firestore()
    .collection('JobRequests')
    .doc(jobID)
    .onSnapshot(onUpdateJob);
});

setTimeout(() => {
  console.log(chalk.red('Ping timed out. Worker does not seem to be running'));
  process.exit(1);
}, TIMEOUT_MILLIS);
