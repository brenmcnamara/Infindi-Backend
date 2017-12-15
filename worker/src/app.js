/* @flow */

import bodyParser from 'body-parser';
import express from 'express';
import morgan from 'morgan';
import routes, { initialize as initializeRoutes } from './routes';

import { getStatusForErrorCode } from 'common/build/error-codes';
import { initialize as initializeWorkers } from './workers';

const app = express();

export function initialize(): void {
  app.use(morgan('dev'));
  app.use(bodyParser.json());

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

  initializeRoutes();
  initializeWorkers();
}

export default app;
