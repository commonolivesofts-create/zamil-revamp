import express from 'express';
import helmet from 'helmet';
import { config } from './config/index.js';
import { checkDatabaseReadiness } from './database/oracle.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { createDocsRouter } from './routes/docs.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { httpLogger } from './shared/logger/index.js';

/**
 * Builds the Express application without binding a port, so it can be started
 * by server.js or exercised directly by Supertest.
 */
export function createApp(appConfig = config, { checkReadiness = checkDatabaseReadiness } = {}) {
  const app = express();

  app.set('trust proxy', appConfig.http.trustProxyHops);

  app.use(requestId);
  app.use(httpLogger);
  // HTTPS is enforced at the gateway (plus HSTS). upgrade-insecure-requests would only break
  // Swagger UI assets when developers reach it over plain HTTP by host/IP.
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use(express.json({ limit: appConfig.http.bodyLimit }));

  app.use(createHealthRouter({ checkReadiness, cacheMs: appConfig.health.readyCacheMs }));
  if (appConfig.apiDocs.enabled) app.use(createDocsRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
