/* eslint-disable no-console */

require('./cli-setup');

// For development purposes, sometimes the need to delete yodlee provider
// accounts that have no account link associated with them comes up. This
// script will automatically do so.

const FirebaseAdmin = require('firebase-admin');
const YodleeManager = require('../build/yodlee/yodlee-manager');

const providerAccountToUser = {};

let users;
let accountLinks;
let providerAccounts;

const genFetchAllUsers = () => FirebaseAdmin.firestore()
  .collection('UserInfo')
  .get()
  .then(snapshot => snapshot.docs.map(doc => doc.data()));

const genFetchAllAccountLinks = () => FirebaseAdmin.firestore()
  .collection('AccountLinks')
  .get()
  .then(snapshot => snapshot.docs.map(doc => doc.data()));

const genDeleteAccountLinks = accountLinks => {
  const batch = FirebaseAdmin.firestore().batch();
  accountLinks.forEach(accountLink => {
    const ref = FirebaseAdmin.firestore().collection('AccountLinks').doc(accountLink.id);
    batch.delete(ref);
  });
  return batch.commit();
};

const genDeleteProviderAccounts = providerAccounts =>
  Promise.all(
    providerAccounts.map((providerAccount, index) =>
      YodleeManager.genDeleteProviderAccount(
        providerAccountToUser[String(providerAccount.id)],
        providerAccount.id
      )
    )
  );

// CODE STARTS HERE

genFetchAllAccountLinks()
  .then(_accountLinks => {
    console.log('Fetch account links');
    accountLinks = _accountLinks;
  })
  .then(() => genFetchAllUsers())
  .then(_users => {
    console.log('Fetched users');
    users = _users;
  })
  .then(() =>
    Promise.all(users.map(user => YodleeManager.genProviderAccounts(user.id)))
      .then(groupedProviderAccounts => {
        groupedProviderAccounts.forEach((providerAccounts, index) => {
          const userID = users[index].id;
          providerAccounts.forEach(providerAccount => {
            providerAccountToUser[String(providerAccount.id)] = userID;
          });
        });
        return groupedProviderAccounts.reduce((all, arr) => all.concat(arr), []);
      })
  )
  .then(_providerAccounts => {
    console.log('fetched provider accounts');
    providerAccounts = _providerAccounts;

    // Now find all provider accounts that are not represented by an account
    // link.
    const unreferencedProviderAccounts = providerAccounts.filter(providerAccount =>
      !accountLinks.some(accountLink =>
        accountLink.sourceOfTruth.type === 'YODLEE' &&
        accountLink.sourceOfTruth.providerAccount.id === providerAccount.id
      )
    );

    const multiReferenceAccountLinks = accountLinks.filter(accountLink =>
      accountLinks.some(innerAccountLink =>
        accountLink !== innerAccountLink &&
        accountLink.sourceOfTruth.type === 'YODLEE' &&
        innerAccountLink.sourceOfTruth.type === 'YODLEE' &&
        accountLink.sourceOfTruth.providerAccount.id ===
          innerAccountLink.sourceOfTruth.providerAccount.id
      )
    );

    const noReferenceAccountLinks = accountLinks.filter(accountLink =>
      accountLink.sourceOfTruth.type === 'YODLEE' &&
      !providerAccounts.some(providerAccount =>
        accountLink.sourceOfTruth.providerAccount.id === providerAccount.id
      )
    );

    console.log('Total Account Links', accountLinks.length);
    console.log('Multi-referenced Account Links', multiReferenceAccountLinks.length);
    console.log('No-reference Account Links', noReferenceAccountLinks.length);
    console.log('Total Provider Accounts:', providerAccounts.length);
    console.log('Unreferenced Provider Accounts:', unreferencedProviderAccounts.length);

    return Promise.all([
      genDeleteAccountLinks(noReferenceAccountLinks),
      genDeleteProviderAccounts(unreferencedProviderAccounts),
    ]);
  })
  .then(() => {
    console.log('Success!');
    process.exit(0);
  })
  .catch(error => {
    console.log(error);
    process.exit(1);
  });
