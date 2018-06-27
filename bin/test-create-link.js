/* eslint-disable no-console, max-len */

require('./cli-setup');

const AccountLink = require('common/lib/models/AccountLink').default;
const AccountLinkMutator = require('common/lib/models/AccountLinkMutator').default;
const AccountLinkOperations = require('../build/operations/account-link').default;

Promise.resolve()
  .then(() => {
    const accountLink = createAccountLink();
    return AccountLinkMutator.genSet(accountLink).then(() => accountLink);
  })
  .then(accountLink => {
    console.log('Empty Account Link Created:', accountLink.id);
    console.log('Linking with Yodlee...');

    const linkPayload = { loginForm: CHASE_LOGIN_FORM, type: 'PERFORM_LOGIN' };
    AccountLinkOperations.performLink(accountLink.id, linkPayload);
  })
  .catch(error => {
    console.log('Unexpected error', error);
    process.exit(1);
  });

const CHASE_LOGIN_FORM = {
  row: [
    {
      field: [
        {
          maxLength: 32,
          name: 'LOGIN',
          valueEditable: true,
          type: 'text',
          value: 'brenmcnamara19',
          id: 567,
          isOptional: false,
        },
      ],
      form: '0001',
      fieldRowChoice: '0001',
      id: 4710,
      label: 'User ID',
    },
    {
      field: [
        {
          name: 'PASSWORD',
          valueEditable: true,
          type: 'password',
          value: 'Renogade1993',
          id: 568,
          isOptional: false,
        },
      ],
      form: '0001',
      fieldRowChoice: '0002',
      id: 11976,
      label: 'Password',
    },
  ],
  id: 324,
  forgetPasswordURL:
    'https://chaseonline.chase.com/Public/ReIdentify/ReidentifyFilterView.aspx?COLLogon',
  formType: 'login',
};

function createAccountLink() {
  const sourceOfTruth = {
    target: 'YODLEE',
    type: 'EMPTY',
  };
  const userID = 'hHAvgFX13ZXNwdpT3fAgArHBfGG2';
  const providerID = '643';
  const providerName = 'Chase';
  return AccountLink.create(sourceOfTruth, userID, providerID, providerName);
}
