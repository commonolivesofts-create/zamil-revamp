import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';
import { AppError } from '../../../shared/errors/AppError.js';
import * as defaultRepository from './requisition.repository.js';
import { recordRecruitmentChange } from './recruitmentAudit.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/*
 * Personal Requisition Form rules (README_personal_requisition_form.md). `authorize` has already
 * checked the actor's REQUISITIONS.REQUISITIONS action; these rules apply on top:
 *   - REQUISITION_STATUS is written only 'Draft' on insert and never transitioned (§11);
 *     Inprocess/Approved merely gate non-HR updates with 409 (§5.0).
 *   - Recruitment status (ATTRIBUTE1) is Open on insert and read-only in form updates.
 *     Dedicated HR actions require Approved status and audit atomically with the change.
 *     First offer acceptance and its actual date are owned by the offer module.
 *   - Listing/read scope (§7.4) is decided from the actor: HR users see every record and may
 *     narrow by createdBy; other users see their own rows plus those of recursively supervised
 *     employees — on every by-id route an out-of-scope row is a 404.
 *   - Attachments (§9): legacy extension allowlist, 10 MB per file, 10 files per request; the DB
 *     row and the physical file are written in the transaction and compensated on failure.
 *   - Business dates travel as ISO 'YYYY-MM-DD' and are stored as legacy 'DD-Mon-YY' (§3.1);
 *     empty text binds NULL, never the literal 'null' (§9 quirk explicitly not reproduced).
 */
export function createRequisitionService({
  repository = defaultRepository,
  auditService,
  storage,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
}) {
  const read = (fn) => withConnection(POOLS.LOW, fn);

  const notFound = () => new AppError(404, 'NOT_FOUND', 'Requisition not found');

  const rejectFormStatus = (body) => {
    if (body.ticketStatus !== undefined) {
      throw new AppError(
        400,
        'USE_RECRUITMENT_ACTION',
        'Recruitment status cannot be changed through the form',
      );
    }
  };
  const actionsFor = (header) => {
    const status = header.ticketStatus || 'Open';
    if (status === 'Open') return ['hold', 'cancel'];
    if (status === 'Accepted')
      return header.acceptedDate ? ['fill', 'hold', 'cancel'] : ['hold', 'cancel'];
    if (status === 'On Hold' || status === 'Cancelled')
      return ['reopen', ...(status === 'On Hold' ? ['cancel'] : [])];
    return [];
  };

  /** Loads a header and enforces §7.4 scope: out-of-scope rows are indistinguishable from 404. */
  const loadForActor = async (actor, requisitionId) => {
    const loaded = await read(async (connection) => {
      const header = await repository.findHeader(connection, requisitionId);
      if (!header) return null;
      const isHr = await repository.isHrUser(connection, actor.userId);
      if (isHr) return { header, isHr };
      const inScope = await repository.createdByInScope(connection, {
        scopeUserId: actor.userId,
        createdBy: header.createdBy,
      });
      return inScope ? { header, isHr: false } : null;
    });
    if (!loaded) throw notFound();
    return loaded;
  };

  /** Inserts one attachment row per file and writes the bytes; compensates on failure. */
  const appendAttachments = async (connection, requisitionId, uploaded) => {
    const written = [];
    try {
      for (const file of uploaded) {
        const attachmentId = await repository.insertAttachment(connection, {
          requisitionId,
          fileName: file.fileName,
        });
        await storage.save({ attachmentId, fileName: file.fileName, buffer: file.buffer });
        written.push({ attachmentId, fileName: file.fileName });
      }
    } catch (error) {
      // The transaction rolls back the rows; bytes already written are removed here.
      await Promise.allSettled(written.map((file) => storage.remove(file)));
      throw error;
    }
    return written;
  };

  return {
    async list(actor, query) {
      const { page, pageSize, sortBy, sortDir, createdBy, ...filters } = query;
      const isHr = await read((connection) => repository.isHrUser(connection, actor.userId));
      // Joi's isoDate normalises date-only query values to full ISO instants; the repository
      // expects the date-only form (Oracle TO_DATE(..., 'YYYY-MM-DD')).
      if (filters.dateFrom) filters.dateFrom = filters.dateFrom.slice(0, 10);
      if (filters.dateTo) filters.dateTo = filters.dateTo.slice(0, 10);
      const { total, items } = await read((connection) =>
        repository.listRequisitions(connection, {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          filters: { ...filters, search: likePattern(filters.search) },
          // The scope wins over whatever a non-HR caller passed (README §7.4).
          createdBy: isHr ? (createdBy ?? null) : null,
          scopeUserId: isHr ? null : actor.userId,
          sortBy,
          sortDir,
        }),
      );
      return { total, items };
    },

    async get(actor, requisitionId) {
      const { header, isHr } = await loadForActor(actor, requisitionId);
      const attachments = await read((connection) =>
        repository.listAttachments(connection, requisitionId),
      );
      return {
        ...header,
        attachments,
        recruitmentActions:
          isHr && header.requisitionStatus === 'Approved' ? actionsFor(header) : [],
      };
    },

    async changeRecruitmentStatus(actor, requisitionId, { action, expectedStatus, reason }) {
      return withTransaction(POOLS.LOW, async (connection) => {
        if (!(await repository.isHrUser(connection, actor.userId))) {
          throw new AppError(403, 'HR_ONLY', 'Only HR users may manage recruitment status');
        }
        const header = await repository.findHeader(connection, requisitionId, { forUpdate: true });
        if (!header) throw notFound();
        if (header.requisitionStatus !== 'Approved') {
          throw new AppError(
            409,
            'REQUISITION_NOT_APPROVED',
            'Recruitment actions require an approved requisition',
          );
        }
        const oldValue = header.ticketStatus || 'Open';
        if (oldValue !== expectedStatus) {
          throw new AppError(
            409,
            'STATUS_CHANGED',
            'Recruitment status has changed. Refresh the details before acting',
          );
        }
        if (!actionsFor(header).includes(action)) {
          throw new AppError(
            409,
            'INVALID_RECRUITMENT_ACTION',
            'This action is not available for the current recruitment status',
          );
        }
        const newValue = {
          hold: 'On Hold',
          cancel: 'Cancelled',
          reopen: header.acceptedDate ? 'Accepted' : 'Open',
          fill: 'Close',
        }[action];
        const updated = await repository.updateHeader(connection, {
          requisitionId,
          values: {},
          ticket: { ticketStatus: newValue },
          updatedBy: actor.userId,
        });
        if (!updated) throw notFound();
        await recordRecruitmentChange(auditService, connection, {
          actor,
          requisitionId,
          oldValue,
          newValue,
          reason: reason || null,
          source: 'REQUISITION_ACTION',
        });
        return { requisitionId };
      });
    },

    async create(actor, body, files) {
      const uploaded = normalizeFiles(files);
      rejectFormStatus(body);

      const { requisitionId } = await withTransaction(POOLS.LOW, async (connection) => {
        // REQUESTED_BY/REQUESTER_NAME are server-set from the employee master (§3.2), never body.
        const requestor = await repository.findRequestor(connection, actor.employeeNumber);
        if (!requestor) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [
            { field: 'employeeNumber', message: 'No employee record exists for your account' },
          ]);
        }
        const id = await repository.insertHeader(connection, {
          requestedBy: requestor.employeeNumber,
          requesterName: requestor.fullName,
          requestDate: toLegacyDate(body.requestDate),
          jobId: emptyToNull(body.jobId),
          jobName: body.jobName,
          deptId: emptyToNull(body.deptId),
          deptName: body.deptName,
          dateNeeded: toLegacyDate(body.dateNeeded),
          reasonOfReq: body.reasonOfReq,
          replacementFor: emptyToNull(body.replacementFor),
          reason: emptyToNull(body.reason),
          budgeted: body.budgeted,
          budgetedSal: body.budgetedSal,
          highSchool: body.highSchool,
          diploma: body.diploma,
          higherDiploma: body.higherDiploma,
          degree: body.degree,
          masterDegree: body.masterDegree,
          gccExp: body.gccExp,
          workExp: body.workExp,
          skills: emptyToNull(body.skills),
          other: emptyToNull(body.other),
          remark: emptyToNull(body.remark),
          totalPackage: body.totalPackage ?? null,
          ticketStatus: 'Open',
          createdBy: actor.userId,
        });
        await repository.setRequisitionNumber(connection, id);
        await appendAttachments(connection, id, uploaded);
        await recordRecruitmentChange(auditService, connection, {
          actor,
          requisitionId: id,
          oldValue: null,
          newValue: 'Open',
          source: 'REQUISITION_CREATE',
        });
        return { requisitionId: id };
      });

      return { requisitionId, requisitionNumber: requisitionId };
    },

    async update(actor, requisitionId, body, files) {
      const { header, isHr } = await loadForActor(actor, requisitionId);
      // §5.0 legacy gate: non-HR users may not save an Inprocess/Approved request.
      if (
        !isHr &&
        (header.requisitionStatus === 'Inprocess' || header.requisitionStatus === 'Approved')
      ) {
        throw new AppError(
          409,
          'CANNOT_UPDATE_STATUS',
          'Request is InProcess/Approved — cannot update data',
        );
      }
      rejectFormStatus(body);
      const uploaded = normalizeFiles(files);

      await withTransaction(POOLS.LOW, async (connection) => {
        const values = {
          jobId: emptyToNull(body.jobId),
          jobName: body.jobName,
          deptId: emptyToNull(body.deptId),
          deptName: body.deptName,
          dateNeeded: toLegacyDate(body.dateNeeded),
          reasonOfReq: body.reasonOfReq,
          replacementFor: emptyToNull(body.replacementFor),
          reason: emptyToNull(body.reason),
          budgeted: body.budgeted,
          budgetedSal: body.budgetedSal,
          highSchool: body.highSchool,
          diploma: body.diploma,
          higherDiploma: body.higherDiploma,
          degree: body.degree,
          masterDegree: body.masterDegree,
          gccExp: body.gccExp,
          workExp: body.workExp,
          skills: emptyToNull(body.skills),
          other: emptyToNull(body.other),
          remark: emptyToNull(body.remark),
          totalPackage: body.totalPackage ?? null,
        };
        // Absent ticketStatus (any caller) leaves ATTRIBUTE1/14/15 untouched (D6).
        const updated = await repository.updateHeader(connection, {
          requisitionId,
          values,
          ticket: null,
          updatedBy: actor.userId,
        });
        if (!updated) throw notFound();
        await appendAttachments(connection, requisitionId, uploaded);
      });

      return { requisitionId };
    },

    async remove(actor, requisitionId) {
      const { header } = await loadForActor(actor, requisitionId);
      // §6 guard 1: only Draft requests may be deleted (approved ones feed the interview form).
      if (header.requisitionStatus !== 'Draft') {
        throw new AppError(409, 'CANNOT_DELETE_STATUS', 'Only Draft requisitions can be deleted');
      }
      const attachments = await read((connection) =>
        repository.listAttachments(connection, requisitionId),
      );

      await withTransaction(POOLS.LOW, async (connection) => {
        // §6 guard 2: refuse when an interview assessment references this requisition.
        const references = await repository.countInterviewReferences(
          connection,
          header.requisitionNumber,
        );
        if (references > 0) {
          throw new AppError(
            409,
            'REQUISITION_IN_USE',
            'This requisition is referenced by an interview assessment and cannot be deleted',
          );
        }
        await repository.deleteAttachmentsByHeader(connection, requisitionId);
        const removed = await repository.deleteHeader(connection, requisitionId);
        if (!removed) throw notFound();
      });

      await Promise.allSettled(attachments.map((file) => storage.remove(file)));
      return { requisitionId, deleted: true };
    },

    async uploadAttachments(actor, requisitionId, files) {
      await loadForActor(actor, requisitionId);
      const uploaded = normalizeFiles(files);
      if (uploaded.length === 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [
          { field: 'files', message: 'At least one file is required' },
        ]);
      }
      await withTransaction(POOLS.LOW, (connection) =>
        appendAttachments(connection, requisitionId, uploaded),
      );
      const attachments = await read((connection) =>
        repository.listAttachments(connection, requisitionId),
      );
      return { requisitionId, attachments };
    },

    async removeAttachment(actor, requisitionId, attachmentId) {
      await loadForActor(actor, requisitionId);
      const attachment = await read((connection) =>
        repository.findAttachment(connection, { requisitionId, attachmentId }),
      );
      if (!attachment) throw new AppError(404, 'NOT_FOUND', 'Attachment not found');

      await withTransaction(POOLS.LOW, async (connection) => {
        const removed = await repository.deleteAttachment(connection, {
          requisitionId,
          attachmentId,
        });
        if (!removed) throw new AppError(404, 'NOT_FOUND', 'Attachment not found');
      });

      // The DB row is authoritative; a failed physical removal only orphans a file on disk.
      await Promise.allSettled([storage.remove(attachment)]);
      return { requisitionId, attachmentId, deleted: true };
    },

    // --- Lookups (README §8) --------------------------------------------------------------------

    async jobTitles() {
      const rows = await read((connection) => repository.listJobTitles(connection));
      return rows.map((row) => ({
        jobId: row.JOB_ID,
        name: row.NAME,
        ...(row.DEPARTMENT_ID === null || row.DEPARTMENT_ID === undefined
          ? {}
          : { departmentId: String(row.DEPARTMENT_ID) }),
      }));
    },

    async requestor(actor) {
      const requestor = await read((connection) =>
        repository.findRequestor(connection, actor.employeeNumber),
      );
      if (!requestor) throw new AppError(404, 'NOT_FOUND', 'Employee record not found');
      return requestor;
    },

    async departments() {
      const rows = await read((connection) => repository.listDepartments(connection));
      return rows.map((row) => ({ deptId: row.ORGANIZATION_ID, name: row.NAME }));
    },

    async replacementFor(actor, search = '') {
      const requestor = await read((connection) =>
        repository.findRequestor(connection, actor.employeeNumber),
      );
      if (!requestor?.employeeNumber) {
        // The legacy lookup returned an empty result when the signed-in user
        // had no employee-master match. Keep the optional replacement list
        // usable without turning that case into a failed form lookup.
        return [];
      }
      return read((connection) =>
        repository.listReplacementCandidates(connection, requestor.employeeNumber, search),
      );
    },

    async budget(fullName) {
      const totalPackage = await read((connection) => repository.findBudget(connection, fullName));
      if (totalPackage === null) throw new AppError(404, 'NOT_FOUND', 'Employee not found');
      return { fullName, totalPackage };
    },

    /** What the caller may do beyond the route permission; the same probe enforces it on save. */
    async capabilities(actor) {
      const isHr = await read((connection) => repository.isHrUser(connection, actor.userId));
      return { canManageTicket: isHr };
    },

    async filterOptions(actor) {
      const isHr = await read((connection) => repository.isHrUser(connection, actor.userId));
      return read((connection) =>
        repository.listFilterOptions(connection, {
          scopeUserId: isHr ? null : actor.userId,
        }),
      );
    },
  };
}

/** 'YYYY-MM-DD' (or a full ISO string) → the stored legacy 'DD-Mon-YY' form (README §3.1). */
function toLegacyDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}-${MONTHS[Number(month) - 1]}-${year.slice(2)}`;
}

/** Empty/absent optional text and ids bind NULL — the legacy literal 'null' quirk is not reproduced. */
function emptyToNull(value) {
  return value === '' || value === undefined ? null : value;
}

/** Escapes a free-text term into the upper-case LIKE pattern the fixed filters bind. */
function likePattern(term) {
  return term ? `%${term.toUpperCase().replace(/[\\%_]/g, '\\$&')}%` : null;
}

/** Validates multer uploads against the §9 extension allowlist and normalises the list. */
function normalizeFiles(files) {
  const list = Array.isArray(files) ? files : [];
  const allowed = /\.(jpg|jpeg|png|gif|txt|doc|docx|pdf|xls|xlsx|csv|html|ppt|pptx|odt)$/i;
  for (const file of list) {
    if (!file.originalname || !allowed.test(file.originalname)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [
        {
          field: 'files',
          message: `Unsupported file extension: ${String(file.originalname ?? '').slice(0, 100)}`,
        },
      ]);
    }
  }
  return list.map((file) => ({ fileName: file.originalname, buffer: file.buffer }));
}
