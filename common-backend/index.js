const DB = require('./build/data-api').default;
const Job = require('./build/job-api').default;

function initialize(admin) {
  DB.initialize(admin);
  Job.initialize(admin);
}

module.exports = {
  DB,
  Job,

  initialize,
};
