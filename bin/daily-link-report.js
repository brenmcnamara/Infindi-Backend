
/* eslint-disable no-console */

require('./cli-setup');

const FirebaseAdmin = require('firebase-admin');

const chalk = require('chalk');

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const ONE_DAY_AGO = new Date(Date.now() - MS_PER_DAY);

FirebaseAdmin.firestore()
  .collection('LinkAttempts')
  .where('createdAt', '>', ONE_DAY_AGO)
  .get()
  .then(snapshot => {
    const statusCounts = {};
    snapshot.docs.forEach(doc => {
      const linkAttempt = doc.data();
      const nextCount = (statusCounts[linkAttempt.status] || 0) + 1;
      statusCounts[linkAttempt.status] = nextCount;
    });

    console.log(chalk.green('\nCOUNT\tSTATUS\n'));
    Object.keys(statusCounts).forEach(status => {
      console.log(chalk.green(statusCounts[status] + '\t' + status));
    });
  });
