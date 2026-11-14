// Composition root: builds every service once from config + data layer. Used by the server,
// by createApp and by tests (which inject a MockFusionClient, a clock and a no-op sleep).
import type { Logger } from 'pino';
import { LocalAuthProvider } from './auth/provider';
import { SessionService } from './auth/session';
import type { AppConfig } from './config';
import type { DataLayer } from './data/ports';
import { LiveFusionClient, type FusionClient } from './integrations/fusion/client';
import { FusionGateway } from './integrations/fusion/gateway';
import { MockFusionClient } from './integrations/fusion/mock/client';
import { JobRunner } from './jobs/runner';
import { systemClock, type Clock } from './lib/dates';
import { ApprovalService } from './modules/approvals/service';
import { AuditService } from './modules/audit/service';
import { AuthService } from './modules/auth/service';
import { DashboardService } from './modules/dashboards/service';
import { NotificationDispatcher } from './modules/notifications/dispatcher';
import {
  createTeamsNotifier,
  createTransport,
  type MessageTransport,
  type TeamsNotifier,
} from './modules/notifications/transports';
import { ExpenseService } from './modules/expenses/service';
import { PayablesService, QuickPayService } from './modules/payables/service';
import { ReceiptService } from './modules/receipts/service';
import { ReportService } from './modules/reports/service';
import { SetupService } from './modules/setup/service';
import { ReceiptFiles } from './receipts/files';
import { createOcr, type OcrProvider } from './receipts/ocr';

export interface Services {
  clock: Clock;
  sessions: SessionService;
  auth: AuthService;
  fusionClient: FusionClient;
  fusion: FusionGateway;
  jobs: JobRunner;
  setup: SetupService;
  receipts: ReceiptService;
  expenses: ExpenseService;
  reports: ReportService;
  approvals: ApprovalService;
  audit: AuditService;
  payables: PayablesService;
  quickPays: QuickPayService;
  dashboards: DashboardService;
  notifications: NotificationDispatcher;
}

export function buildServices(deps: {
  config: AppConfig;
  data: DataLayer;
  logger: Logger;
  clock?: Clock;
  fusionClient?: FusionClient;
  sleep?: (ms: number) => Promise<void>;
  ocr?: OcrProvider;
  /** Tests inject a capturing transport / Teams notifier. */
  transport?: MessageTransport;
  teams?: TeamsNotifier | null;
}): Services {
  const { config, data, logger } = deps;
  const clock = deps.clock ?? systemClock;

  const sessions = new SessionService(config.session.secret, config.isProduction, clock);
  // OQ-22 proposal: local accounts; an Entra ID provider plugs in here later.
  const provider = new LocalAuthProvider(data, clock, config.auth.bcryptCost);
  const auth = new AuthService({ data, provider, config, clock });

  const fusionClient =
    deps.fusionClient ??
    (config.fusion.mode === 'mock'
      ? new MockFusionClient({ stateFile: config.fusion.mockStateFile })
      : new LiveFusionClient({
          // loadConfig requires these when FUSION_MODE=live.
          baseUrl: config.fusion.baseUrl!,
          user: config.fusion.user!,
          password: config.fusion.password!,
          bipPathPrefix: config.fusion.bipPathPrefix,
          restVersion: config.fusion.restVersion,
        }));
  const fusion = new FusionGateway({
    client: fusionClient,
    data,
    config,
    retryDelaysMs: config.fusion.retryDelaysMs,
    sleep: deps.sleep,
  });
  const files = new ReceiptFiles(config.receipts.dir);
  const appBaseUrl = config.web.baseUrl;
  const jobs = new JobRunner({ data, fusion, clock, logger, files, appBaseUrl });
  const setup = new SetupService({ data, clock });

  const receipts = new ReceiptService({
    data,
    files,
    ocr: deps.ocr ?? createOcr(config.ocr.provider),
    clock,
    logger,
  });
  const expenses = new ExpenseService({ data, clock, files });
  const reports = new ReportService({ data, clock, appBaseUrl: config.web.baseUrl });
  const approvals = new ApprovalService({ data, clock, appBaseUrl: config.web.baseUrl });
  const audit = new AuditService({ data, clock, appBaseUrl: config.web.baseUrl });
  const payablesDeps = { data, fusion, clock, files, appBaseUrl };
  const payables = new PayablesService({ ...payablesDeps, jobs });
  const quickPays = new QuickPayService(payablesDeps);
  const dashboards = new DashboardService({ data, clock, approvals });
  const notifications = new NotificationDispatcher({
    data,
    logger,
    transport: deps.transport ?? createTransport(config, logger),
    teams: deps.teams ?? createTeamsNotifier(config, logger),
  });

  return {
    clock,
    sessions,
    auth,
    fusionClient,
    fusion,
    jobs,
    setup,
    receipts,
    expenses,
    reports,
    approvals,
    audit,
    payables,
    quickPays,
    dashboards,
    notifications,
  };
}
