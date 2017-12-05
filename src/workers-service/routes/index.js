/* @flow */

import express from 'express';

import { getStatusForErrorCode } from 'common/error-codes';

const router = express.Router();

export default router;

router.get('/status', (req, res) => {
  const errorCode = 'infindi/not-yet-implemented';
  const errorMessage = 'This endpoint is not yet implemented';
  const status = getStatusForErrorCode(errorCode);
  res.status(status).json({ errorCode, errorMessage });
});
