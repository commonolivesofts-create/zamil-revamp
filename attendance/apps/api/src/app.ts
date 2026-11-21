// Express application factory. Every dependency is injected so tests build their own app.
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { API_BASE } from '@attendance/shared';
import type { IdentityRepository } from './auth/identity';
import { sessionMiddleware, type ZamilResolver } from './auth/middleware';
import { authRoutes } from './auth/routes';
import type { SessionService } from './auth/session';
import type { revokeZamilSession } from './auth/zamil-sso';
import type { AppConfig } from './config';
import type { Db } from './db/oracle';
import { errorHandler, notFound, requireAppHeader } from './middleware/http';
import { absenceRoutes } from './modules/absences/routes';
import { employeeRoutes } from './modules/employees/routes';
import { healthRoutes } from './modules/health/routes';
import { attendanceCardRoutes } from './modules/attendanceCard/routes';
import { occasionRoutes } from './modules/occasions/routes';
import { shiftRoutes } from './modules/shifts/routes';
import { timetableRoutes } from './modules/timetables/routes';
import { buildRepositories, type Repositories } from './services';

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  db: Db;
  sessions: SessionService;
  identities: IdentityRepository;
  /** Overrides for tests (default: Oracle repositories over `db`). */
  repositories?: Partial<Repositories>;
  resolveZamil?: ZamilResolver;
  revokeZamil?: typeof revokeZamilSession;
}

export function createApp(deps: AppDeps): Express {
  const { config, logger, db, sessions } = deps;
  const r = buildRepositories(db, deps.repositories);

  const app = express();
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
  // No CORS: the web app is same-origin through the Vite proxy.
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(requireAppHeader);
  api.use(healthRoutes(db));
  api.use(
    sessionMiddleware({ sessions, zamil: config.auth.zamil, resolveZamil: deps.resolveZamil }),
  );
  api.use(
    authRoutes({
      sessions,
      identities: deps.identities,
      zamil: config.auth.zamil,
      resolveZamil: deps.resolveZamil,
      revokeZamil: deps.revokeZamil,
    }),
  );
  api.use(employeeRoutes(r.employees));
  api.use(absenceRoutes(r.absences));
  api.use(shiftRoutes({ shifts: r.shifts, list: r.shiftList, weekList: r.shiftWeekList }));
  api.use(timetableRoutes({ timetables: r.timetables, list: r.timetableList }));
  api.use(occasionRoutes({ occasions: r.occasions, list: r.occasionList }));
  api.use(attendanceCardRoutes({ list: r.attendanceCardList, importer: r.attendanceImporter }));
  app.use(API_BASE, api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
