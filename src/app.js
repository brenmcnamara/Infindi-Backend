/* @flow */

import Common from 'common';

import bodyParser from 'body-parser';
import express from 'express';
import morgan from 'morgan';
import path from 'path';
import routes, { initialize as initializeRoutes } from './routes';
import serveFavicon from 'serve-favicon';

import { initialize as initializeJobRunner } from './job-runner';
import { initialize as initializeYodleeManager } from './yodlee-manager';

const { ErrorUtils } = Common;

const app = express();

export default app;

export function initialize(): void {
  // view engine setup
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('view engine', 'ejs');

  app.use(
    serveFavicon(path.join(__dirname, '..', 'assets', 'favicon-16x16.ico')),
  );
  app.use(morgan('dev'));
  app.use(bodyParser.json());

  app.use('/', routes);

  app.use((req, res) => {
    const errorCode = 'infindi/resource-not-found';
    const errorMessage = 'Resource not found';
    const status = ErrorUtils.getStatusForErrorCode(errorCode);
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
  initializeJobRunner();
  initializeYodleeManager();
}
