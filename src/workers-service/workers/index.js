/* @flow */

import bodyParser from 'body-parser';
import express from 'express';
import morgan from 'morgan';

import { getStatusForErrorCode } from 'common/error-codes';
import {
  getWorkerID as getPlaidWorkerID,
  initialize as initializePlaid,
} from './plaid';

export const app = express();

export function initialize(): void {
  app.use(morgan('dev'));
  app.use(bodyParser.json());

  const routes = express.Router();

  // routes
  routes.get('/status', (req, res) => {
    res.json({
      data: {
        workers: [{ name: 'plaid', id: getPlaidWorkerID() }],
      },
    });
  });

  app.use('/', routes);

  app.use((req, res) => {
    const errorCode = 'infindi/resource-not-found';
    const errorMessage = 'Resource not found';
    const status = getStatusForErrorCode(errorCode);
    res.status(status).json({ errorCode, errorMessage });
    return;
  });

  // error handler
  app.use((err, req, res) => {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
  });

  initializePlaid();
}
