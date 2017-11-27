/* @flow */

import express from 'express';

import { checkAuth, type RouteHandler } from '../middleware';

const router = express.Router();

export default router;

// -----------------------------------------------------------------------------
//
// GET /auth/litmus
//
// -----------------------------------------------------------------------------

function performMe(): RouteHandler {
  return (req, res) => {
    res.json(req.decodedIDToken);
  };
}

router.get('/litmus', checkAuth());
router.get('/litmus', performMe());
