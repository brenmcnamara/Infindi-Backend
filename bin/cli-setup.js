#!/usr/bin/env node

/**
 * NOTE: This file is not transformed via babel. Must use
 * syntax this works with the runnning version of node.
 */

const Common = require('common');
const FirebaseAdmin = require('firebase-admin');
const YodleeManager = require('../build/yodlee/YodleeManager-V1.0').default;

const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');


dotenv.config();

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
YodleeManager.initialize();
