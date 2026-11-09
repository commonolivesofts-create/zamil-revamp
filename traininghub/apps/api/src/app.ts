import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFoundRoute, requireAppHeader } from './middleware';
import { fromRepoRoot } from './paths';
import { apiRouter } from './routes';
import type { Services } from './services';

export function createApp(svc: Services) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(helmet({ contentSecurityPolicy: svc.config.isProduction ? undefined : false }));
  app.use(pinoHttp({ logger: svc.log, autoLogging: { ignore: (req) => req.url === '/api/v1/health' } }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api/v1', requireAppHeader, (req, _res, next) => {
    req.ctx = svc.ctx(null);
    req.ctx.log = req.log;
    next();
  }, apiRouter(svc));
  app.use('/api', notFoundRoute);
  // In production the API also serves the built web app.
  const dist = fromRepoRoot('apps/web/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
