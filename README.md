# Infindi-Backend

## Build and Running Locally

#### Pre-Requisites
Install the following:
- [node js](https://nodejs.org/en/download/)
- [yarn](https://flow.org/en/docs/install/)

#### Do the Following
1. Clone the repo, then `cd path/to/repo`
2. You must acquire a `.env` file from the owner
  - You can find that file [here](https://drive.google.com/drive/u/0/folders/1yOl9S1kT19nB8OHYvvI24axkIpSIZRbG) if you have access permission
  - Download `env.txt`
  - Rename it to `.env`
  - Place it in the root of the repo
3. `yarn`
4. `npm run build`
5. `npm start`


## Deploying Web Service

**NOTE:** If your name is not Brendan McNamara, you should probably not be doing this.

#### Pre-Requisites
1. Get a copy of the web environmnt variable file (not committed with the repo)
2. [gcloud](https://cloud.google.com/sdk/docs/#install_the_latest_cloud_tools_version_cloudsdk_current_version) must be installed in your local environment and you must be logged into the infindi account
2. Get a copy of the firebase admin certificate (not committed with the repo)

#### Instructions

- In the web directory, run: `gcloud app deploy`

## Deploying Worker Service

**NOTE:** If your name is not Brendan McNamara, you should probably not be doing this.

#### Pre-Requisites
1. Get a copy of the worker environmnt variable file (not committed with the repo)
2. [gcloud](https://cloud.google.com/sdk/docs/#install_the_latest_cloud_tools_version_cloudsdk_current_version) must be installed in your local environment and you must be logged into the infindi account
2. Get a copy of the firebase admin certificate (not committed with the repo)

#### Instructions

- In the worker directory, run: `gcloud app deploy`

## Testing common and common-backend modules using Infindi-Backend

1. Navigate to local common / common-backend repo and run:

`yarn link`

2. Navigate back to infindi-backend repo and run:

`yarn link common # or common-backend`

3. Make sure to run `npm run build` whenever adding changes to the common / common-backend code

4. When done testing, run `yarn unlink` from common / common-backend

## Manual Testing

### Test Job Requests

1. Test that multiple job workers can listen for job requests without:
  a. Grabbing the same request
  b. Skipping requests
  c. Working on the same request more than once

2. Test that a job worker that fails will mark the job as failed with the correct error payload.
