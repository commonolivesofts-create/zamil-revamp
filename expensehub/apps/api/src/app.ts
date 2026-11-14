// Express application factory. Everything is injected so tests build their own app.
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { authenticate } from './auth/middleware';
import type { AppConfig } from './config';
import type { DataLayer } from './data/ports';
import { requireAppHeader } from './middleware/csrf';
import { errorHandler, notFound } from './middleware/errors';
import { adminRoutes } from './modules/admin/routes';
import { approvalRoutes } from './modules/approvals/routes';
import { auditRoutes } from './modules/audit/routes';
import { authRoutes } from './modules/auth/routes';
import { reportRoutes } from './modules/reports/routes';
import { dashboardRoutes } from './modules/dashboards/routes';
import { devRoutes } from './modules/dev/routes';
import { expenseRoutes } from './modules/expenses/routes';
import { payablesRoutes } from './modules/payables/routes';
import { receiptRoutes } from './modules/receipts/routes';
import { healthRoutes } from './modules/health/routes';
import { refRoutes } from './modules/ref/routes';
import { setupRoutes } from './modules/setup/routes';
import { buildServices, type Services } from './services';

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  data: DataLayer;
  /** Pre-built services (server, tests); built from config when omitted. */
  services?: Services;
  /** Overrides data.ping() (tests). */
  checkDataStore?: () => Promise<boolean>;
}

export const API_BASE = '/api/v1';

export function createApp({ config, logger, data, services, checkDataStore }: AppDeps): Express {
  const app = express();
  const startedAt = Date.now();
  const s = services ?? buildServices({ config, data, logger });

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      autoLogging: { ignore: (req) => req.url === `${API_BASE}/health` },
    }),
  );
  // No CORS middleware: the web app is same-origin (Vite proxy in dev), so cross-origin
  // browsers are refused by default (TRD §13 "CORS only APP_BASE_URL").
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(requireAppHeader);
  api.use(authenticate({ data, sessions: s.sessions, clock: s.clock, zamil: config.auth.zamil }));
  api.use(
    healthRoutes({
      config,
      checkDataStore: checkDataStore ?? (() => data.ping()),
      startedAt,
    }),
  );
  api.use(authRoutes({ config, data, auth: s.auth, sessions: s.sessions }));
  api.use(refRoutes({ data }));
  api.use(receiptRoutes({ config, data, receipts: s.receipts }));
  api.use(expenseRoutes({ data, expenses: s.expenses }));
  api.use(reportRoutes({ data, reports: s.reports }));
  api.use(approvalRoutes({ data, approvals: s.approvals, reports: s.reports }));
  api.use(auditRoutes({ data, audit: s.audit, reports: s.reports }));
  api.use(setupRoutes({ data, setup: s.setup, clock: s.clock }));
  api.use(
    adminRoutes({
      config,
      data,
      jobs: s.jobs,
      clock: s.clock,
      scheduleEnabled: config.jobs.enabled,
    }),
  );
  api.use(payablesRoutes({ config, payables: s.payables, quickPays: s.quickPays }));
  api.use(dashboardRoutes({ dashboards: s.dashboards }));
  if (config.auth.devQuickLogin) {
    api.use(devRoutes({ data, config, fusionClient: s.fusionClient, jobs: s.jobs }));
  }
  app.use(API_BASE, api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
