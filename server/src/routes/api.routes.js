import { Router } from 'express';
import { POOLS, withConnection } from '../database/oracle.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { createAuthorize } from '../middleware/authorize.js';
import { createAuthorizationService } from '../modules/access-control/authorization.service.js';
import { createRbacRouter } from '../modules/access-control/rbac.routes.js';
import { createRbacService } from '../modules/access-control/rbac.service.js';
import { createOriginCheck } from '../middleware/csrf.js';
import { createSecurityAuditService } from '../modules/audit/securityAudit.service.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createAuthService } from '../modules/auth/auth.service.js';
import { createMfaService } from '../modules/auth/mfa.service.js';
import { createRecoveryService } from '../modules/auth/recovery.service.js';
import { findDatabaseName } from '../modules/notifications/databaseIdentity.repository.js';
import { createUnconfiguredDelivery } from '../modules/notifications/delivery.js';
import { createSmtpDelivery } from '../modules/notifications/smtpDelivery.js';
import { createMfaKeyring } from '../modules/auth/mfaSecret.js';
import { createSessionService } from '../modules/auth/session.service.js';
import { createEmploymentOfferRouter } from '../modules/hr/employment-offers/employmentOffer.routes.js';
import { createEmploymentOfferService } from '../modules/hr/employment-offers/employmentOffer.service.js';
import { createInterviewAssessmentRouter } from '../modules/hr/interview-assessments/interviewAssessment.routes.js';
import { createInterviewAssessmentService } from '../modules/hr/interview-assessments/interviewAssessment.service.js';
import { createProbationEvaluationRouter } from '../modules/hr/probation-evaluations/probationEvaluation.routes.js';
import { createProbationEvaluationService } from '../modules/hr/probation-evaluations/probationEvaluation.service.js';
import { createOrientationTrainingRouter } from '../modules/hr/orientation-trainings/orientationTraining.routes.js';
import { createOrientationTrainingService } from '../modules/hr/orientation-trainings/orientationTraining.service.js';
import { createContractorEmployeeRouter } from '../modules/hr/contractor-employees/contractorEmployee.routes.js';
import { createContractorEmployeeService } from '../modules/hr/contractor-employees/contractorEmployee.service.js';
import { createRequisitionRouter } from '../modules/hr/requisitions/requisition.routes.js';
import { createRequisitionService } from '../modules/hr/requisitions/requisition.service.js';
import { createTransferRequestRouter } from '../modules/hr/transfer-requests/transferRequest.routes.js';
import { createTransferRequestService } from '../modules/hr/transfer-requests/transferRequest.service.js';
import { createPerformanceAppraisalRouter } from '../modules/hr/performance-appraisals/performanceAppraisal.routes.js';
import { createPerformanceAppraisalService } from '../modules/hr/performance-appraisals/performanceAppraisal.service.js';
import { createDiskStorage } from '../modules/hr/requisitions/requisition.storage.js';
import { createUsersRouter } from '../modules/users/users.routes.js';
import { createUsersService } from '../modules/users/users.service.js';

import { createPersonalStatusRoutes } from '../modules/hr/personal-status/personalStatusChange.routes.js';
import { createPersonalStatusRepository } from '../modules/hr/personal-status/personalStatusChange.repository.js';
import { createPersonalStatusService } from '../modules/hr/personal-status/personalStatusChange.service.js';

import { createEmployeeOfTheMonthRouter } from '../modules/hr/employee-of-the-month/employeeOfTheMonth.routes.js';

import { createEmployeeOfTheMonthService } from '../modules/hr/employee-of-the-month/employeeOfTheMonth.service.js';

import { createIdeaRouter } from '../modules/hr/ideas/idea form routes .js';
import { createIdeaService } from '../modules/hr/ideas/idea form service.js';

import { createSickLeaveRouter } from '../modules/hr/sick-leave/sickLeave.routes.js';

import { createSickLeaveService } from '../modules/hr/sick-leave/sickLeave.service.js';

import { parsePermission } from '../modules/access-control/authorization.service.js';

import { createEmployeeClearanceRouter } from '../modules/hr/employee-clearance/employee_clearance_routes.js';

import { createEmployeeClearanceService } from '../modules/hr/employee-clearance/employee_clearance_service.js';

import { createSurveyReportRouter } from '../modules/hr/surveyReport/surveyReport.routes.js';

import { createSurveyReportService } from '../modules/hr/surveyReport/surveyReport.service.js';

import { createProjectCharterRouter } from '../modules/hr/project-charter/projectCharter.routes.js';

import { createProjectCharterService } from '../modules/hr/project-charter/projectCharter.service.js';

/**
 * Versioned business API (/api/v1). `deps` lets tests substitute repositories and the
 * connection/transaction helpers; production uses the shared Oracle LOW pool.
 *
 * @param {object} appConfig Validated configuration.
 * @param {object} [deps]
 */
export function createApiRouter(appConfig, deps = {}) {
  const db = deps.db ?? {};
  // Mandatory administrator MFA (default true). false only under the local-development or explicit
  // APP_ENV=Test exception validated by config/index.js; every service applies the same policy.
  const adminMfaRequired = appConfig.auth.adminMfaRequired !== false;
  const auditService = createSecurityAuditService({
    repository: deps.auditRepository,
    withTransaction: db.withTransaction,
  });
  const sessionService = createSessionService({
    repository: deps.sessionRepository,
    auditService,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
    touchIntervalMs: appConfig.auth.sessionTouchIntervalMs,
    adminMfaRequired,
  });
  // MFA can be completed only with the TOTP key ring; without it mandatory-MFA users stay blocked.
  const { mfa } = appConfig.auth;
  const keyring = mfa.encryptionKey
    ? createMfaKeyring({ encryptionKey: mfa.encryptionKey, keyId: mfa.keyId })
    : null;
  const mfaService = keyring
    ? createMfaService({
        keyring,
        issuer: mfa.issuer,
        authRepository: deps.authRepository,
        sessionRepository: deps.sessionRepository,
        auditService,
        withConnection: db.withConnection,
        withTransaction: db.withTransaction,
        adminMfaRequired,
      })
    : null;
  const authService = createAuthService({
    authRepository: deps.authRepository,
    sessionRepository: deps.sessionRepository,
    auditService,
    mfaService,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
    argon2Cost: deps.argon2Cost ?? appConfig.auth.argon2,
    adminMfaRequired,
    adminMfaExemption: appConfig.auth.adminMfaExemption ?? 'LOCAL_DEVELOPMENT',
  });
  // Office 365 SMTP when enabled; otherwise unconfigured, so delivery-dependent flows fail closed.
  const withDatabase = db.withConnection ?? withConnection;
  const delivery =
    deps.delivery ??
    (appConfig.smtp?.enabled
      ? createSmtpDelivery({
          smtp: appConfig.smtp,
          links: appConfig.links,
          readDatabaseName: () => withDatabase(POOLS.LOW, findDatabaseName),
        })
      : createUnconfiguredDelivery());
  const recoveryService = createRecoveryService({
    recoveryRepository: deps.recoveryRepository,
    usersRepository: deps.usersRepository,
    authRepository: deps.authRepository,
    sessionRepository: deps.sessionRepository,
    auditService,
    delivery,
    keyring,
    issuer: mfa.issuer,
    argon2Cost: deps.argon2Cost ?? appConfig.auth.argon2,
    backgroundTasks: deps.backgroundTasks,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });
  const authenticate = createAuthenticate({ sessionService, cookieConfig: appConfig.auth.cookie });
  const authorizationService = createAuthorizationService({
    repository: deps.authorizationRepository,
    auditService,
    withConnection: db.withConnection,
    adminMfaRequired,
  });
  const authorize = createAuthorize({ authorizationService });
  const rbacService = createRbacService({
    repository: deps.rbacRepository,
    authorizationService,
    auditService,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });

  const usersService = createUsersService({
    repository: deps.usersRepository,
    sessionRepository: deps.sessionRepository,
    rbacRepository: deps.rbacRepository,
    auditService,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });

  const interviewAssessmentService = createInterviewAssessmentService({
    repository: deps.interviewAssessmentRepository,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });

  const probationEvaluationService = createProbationEvaluationService({
    repository: deps.probationEvaluationRepository,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });

  const orientationTrainingService = createOrientationTrainingService({
    repository: deps.orientationTrainingRepository,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });

  const contractorEmployeeService = createContractorEmployeeService({
    repository: deps.contractorEmployeeRepository,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });

  const employmentOfferService = createEmploymentOfferService({
    repository: deps.employmentOfferRepository,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });

  const requisitionService = createRequisitionService({
    repository: deps.requisitionRepository,
    // Physical attachment files land on local disk (README §6); tests inject a memory double.
    storage: deps.requisitionStorage ?? createDiskStorage(),
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });
  const personalStatusRepository =
    deps.personalStatusRepository ?? createPersonalStatusRepository();
  const personalStatusService =
    deps.personalStatusService ??
    createPersonalStatusService({
      repository: personalStatusRepository,
      withConnection: db.withConnection,
      withTransaction: db.withTransaction,
    });

  const transferRequestService = createTransferRequestService({
    repository: deps.transferRequestRepository,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });

  const performanceAppraisalService = createPerformanceAppraisalService({
    repository: deps.performanceAppraisalRepository,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });

  const router = Router();
  router.use(createOriginCheck({ allowedOrigins: appConfig.auth.allowedOrigins }));
  router.use(
    '/auth',
    createAuthRouter({
      authService,
      sessionService,
      mfaService,
      auditService,
      recoveryService,
      authenticate,
      authConfig: appConfig.auth,
    }),
  );

  const employeeOfTheMonthService = createEmployeeOfTheMonthService({
    repository: deps.employeeOfTheMonthRepository,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });

  const sickLeaveService = createSickLeaveService({
    repository: deps.sickLeaveRepository,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,

    storage: deps.sickLeaveStorage ?? createDiskStorage(),

    // HR visibility must be verified through RBAC.
    hrCheck:
      deps.sickLeaveHrCheck ??
      (async (actor) => {
        const key = process.env.SICK_LEAVE_HR_RESOURCE_KEY;

        if (!key) return false;

        const permission = parsePermission(key, process.env.SICK_LEAVE_HR_ACTION ?? 'VIEW');

        return authorizationService.holds(actor.userId, permission);
      }),
  });

  const employeeClearanceService = createEmployeeClearanceService({
    repository: deps.employeeClearanceRepository,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
    holds: (userId, permission) => authorizationService.holds(userId, permission),
  });

  router.use(
    '/access-control',
    createRbacRouter({ rbacService, authorizationService, authorize, authenticate, auditService }),
  );

  router.use(
    '/users',
    createUsersRouter({ usersService, recoveryService, authorize, authenticate, auditService }),
  );

  router.use(
    '/hr/interview-assessments',
    createInterviewAssessmentRouter({
      interviewAssessmentService,
      authorize,
      authenticate,
      auditService,
    }),
  );

  router.use(
    '/hr/probation-evaluations',
    createProbationEvaluationRouter({
      probationEvaluationService,
      authorize,
      authenticate,
      auditService,
    }),
  );

  router.use(
    '/hr/orientation-trainings',
    createOrientationTrainingRouter({
      orientationTrainingService,
      authorize,
      authenticate,
      auditService,
    }),
  );

  router.use(
    '/hr',
    createContractorEmployeeRouter({
      contractorEmployeeService,
      authorize,
      authenticate,
      auditService,
    }),
  );

  router.use(
    '/hr/employment-offers',
    createEmploymentOfferRouter({
      employmentOfferService,
      authorize,
      authenticate,
      auditService,
    }),
  );

  router.use(
    '/hr/requisitions',
    createRequisitionRouter({
      requisitionService,
      authorize,
      authenticate,
      auditService,
    }),
  );

  router.use(
    '/hr/transfer-requests',
    createTransferRequestRouter({ transferRequestService, authorize, authenticate, auditService }),
  );

  router.use(
    '/hr/performance-appraisals',
    createPerformanceAppraisalRouter({
      performanceAppraisalService,
      authorize,
      authenticate,
      auditService,
    }),
  );
  // Personal Status Change Form
  router.use(
    '/hr/personnel-record-changes',
    createPersonalStatusRoutes({
      personalStatusService,
      authenticate,
      authorize,
      auditService,
    }),
  );

  router.use(
    '/hr/employee-of-the-month',
    createEmployeeOfTheMonthRouter({
      service: employeeOfTheMonthService,
      authorize,
      authenticate,
      auditService,
    }),
  );

  router.use(
    '/ideas',
    createIdeaRouter({
      ideaService: createIdeaService({
        withConnection: db.withConnection,
        withTransaction: db.withTransaction,
      }),
      authenticate,
      auditService,
    }),
  );

  router.use(
    '/hr/sick-leave',
    createSickLeaveRouter({
      service: sickLeaveService,
      authenticate,
      authorize,
      auditService,
    }),
  );

  router.use(
    '/hr/employee-clearance',
    createEmployeeClearanceRouter({
      employeeClearanceService,
      authorize,
      authenticate,
      auditService,
    }),
  );

  router.use(
    '/survey',
    createSurveyReportRouter({
      surveyReportService:
        deps.surveyReportService ??
        createSurveyReportService({
          repository: deps.surveyReportRepository,
          withConnection: db.withConnection,
          withTransaction: db.withTransaction,
        }),

      authenticate,
      authorize,
      auditService,

      surveyResourceKey: deps.surveyResourceKey,
    }),
  );

  router.use(
    '/projects/charters',
    createProjectCharterRouter({
      projectCharterService: createProjectCharterService({
        repository: deps.projectCharterRepository,
        withConnection: db.withConnection,
        withTransaction: db.withTransaction,
      }),
      authenticate,
      authorize,
      auditService,
    }),
  );

  return router;
}
