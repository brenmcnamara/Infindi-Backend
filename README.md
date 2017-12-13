# Infindi-Backend

## Manual Testing

### Test Job Requests

1. Test that multiple job workers can listen for job requests without:
  a. Grabbing the same request
  b. Skipping requests
  c. Working on the same request more than once

2. Test that a job worker that fails will mark the job as failed with the correct error payload.
