import type { Logger } from 'pino';
import type { AppConfig } from './config';
import { createStore } from './db';
import type { Store } from './db/store';
import type { Ctx } from './domain/ctx';
import { LiveEmployeeSource, MockEmployeeSource, SqlEmployeeSource, type EmployeeSource } from './integrations/fusion/employees';
import { OracleStore } from './db/oracle';
import { systemClock, type Clock } from './lib/dates';
import { SessionService } from './auth/session';
import { DEMO_PEOPLE } from './seed/seed';

export interface Services {
  config: AppConfig;
  store: Store;
  clock: Clock;
  log: Logger;
  sessions: SessionService;
  employees: EmployeeSource;
  ctx(actor?: number | null): Ctx;
}

export function createServices(
  config: AppConfig,
  log: Logger,
  overrides: Partial<Pick<Services, 'store' | 'clock' | 'employees'>> = {},
): Services {
  const clock = overrides.clock ?? systemClock;
  const store = overrides.store ?? createStore(config);
  const svc: Services = {
    config,
    store,
    clock,
    log,
    sessions: new SessionService(config.session.secret, config.isProduction, clock),
    employees:
      overrides.employees ??
      (config.fusion.mode === 'live'
        ? new LiveEmployeeSource(config.fusion)
        : config.fusion.mode === 'sql' && store instanceof OracleStore
          ? new SqlEmployeeSource(store, config.fusion.employeeSql!)
          : new MockEmployeeSource(DEMO_PEOPLE)),
    ctx: (actor = null) => ({ store, config, clock, log, actor }),
  };
  return svc;
}
