#!/usr/bin/env node

/* eslint-disable no-console */

const BackendAPI = require('common-backend');
const FirebaseAdmin = require('firebase-admin');

const chalk = require('chalk');
const dotenv = require('dotenv');
const fs = require('fs');
const minimist = require('minimist');
const path = require('path');
const uuid = require('uuid/v4');

const argv = minimist(process.argv.slice(2));

console.log('Configuring environment variables...');
dotenv.config();

console.log('Initializing Firebase Admin...');

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

BackendAPI.initialize(FirebaseAdmin);

console.log('listening for job requests...');

const workerID = uuid();

BackendAPI.Job.listenToJobRequest(
  'TEST_JOB',
  workerID,
  (payload) => {
    console.log(chalk.green('Received Request: [' + workerID + ']'));
    return sleep(payload.timeSleep).then(() => {
      if (argv.fail) {
        console.log(chalk.red('Failing Request: [' + workerID + ']'));
        const errorCode = 'infindi/test-fail';
        const errorMessage = 'This is a test failure';
        throw {
          errorCode,
          errorMessage,
          toString: () => `[${errorCode}]: ${errorMessage}`,
        };
      } else {
        console.log(chalk.green('Finished Request: [' + workerID + ']'));
      }
    });
  });


function sleep(seconds) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, seconds * 1000);
  });
}
