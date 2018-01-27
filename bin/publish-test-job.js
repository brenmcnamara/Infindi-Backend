#!/usr/bin/env node

/* eslint-disable no-console */

const BackendAPI = require('common-backend');
const FirebaseAdmin = require('firebase-admin');

const chalk = require('chalk');
const dotenv = require('dotenv');
const fs = require('fs');
const minimist = require('minimist');
const path = require('path');

const argv = minimist(process.argv.slice(2));
const timeoutSeconds = argv.timeout || 1;

const timesFirstPass = parseInt(argv.times, 10);
const times = timesFirstPass > 0 ? timesFirstPass : 1;

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

for (let i = 0; i < times; ++i) {
  BackendAPI.Job
    .genRequestJob('TEST_JOB', {timeSleep: timeoutSeconds})
    .then(() => {
      console.log(chalk.green('job has been sent'));
    });
}
