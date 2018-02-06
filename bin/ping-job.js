#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * NOTE: This file is not transformed via babel. Must use
 * syntax this works with the runnning version of node.
 */

/**
 * Module dependencies.
 */

const Common = require('common');
const FirebaseAdmin = require('firebase-admin');
const Job = require('common/lib/models/Job');

const chalk = require('chalk');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const MILLIS_PER_SECOND = 1000;
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

Common.initializeAsAdmin(FirebaseAdmin);

console.log('Pinging worker...');
const job = Job.createJob(
  '/ping',
  {},
  {type: 'ONCE', runAt: new Date(Date.now() + MILLIS_PER_SECOND * 5)},
);

Job.genCreateJob(job).then(() => {
  console.log(chalk.green('Job was sent. See service logs to check that it was called'));
  process.exit(0);
});

setTimeout(() => {
  console.log(chalk.red('Ping timed out. Worker does not seem to be running'));
  process.exit(1);
}, TIMEOUT_MILLIS);
