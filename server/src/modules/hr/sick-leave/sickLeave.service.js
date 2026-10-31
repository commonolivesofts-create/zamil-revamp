import { randomUUID } from 'node:crypto';

import {
  POOLS,
  withConnection as defaultRead,
  withTransaction as defaultWrite,
} from '../../../database/oracle.js';

import { AppError } from '../../../shared/errors/AppError.js';
import * as repo from './sickLeave.repository.js';

const bad = (msg) =>
  new AppError(400, 'VALIDATION_ERROR', 'Validation failed', [{ field: 'dates', message: msg }]);

const conflict = (status) =>
  new AppError(409, 'STATE_CONFLICT', `Request is ${status} and cannot be modified`);

const missing = () => new AppError(404, 'NOT_FOUND', 'Sick leave request not found');

const deny = () => new AppError(403, 'FORBIDDEN', 'Access denied');

// Both endpoints inclusive.
// Each endpoint can independently be FULL or HALF.
export function calculateDays({ fromDate, toDate, fromDayType, toDayType }) {
  const start = Date.parse(`${fromDate}T00:00:00Z`);
  const end = Date.parse(`${toDate}T00:00:00Z`);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw bad('toDate must not be before fromDate');
  }

  if (!['FULL', 'HALF'].includes(fromDayType) || !['FULL', 'HALF'].includes(toDayType)) {
    throw bad('Invalid day type');
  }

  // One date: count only one portion.
  if (start === end) {
    if (fromDayType !== toDayType) {
      throw bad('Single-date day types must match');
    }

    return fromDayType === 'HALF' ? 0.5 : 1;
  }

  return (
    Math.round((end - start) / 86400000) +
    1 -
    (fromDayType === 'HALF' ? 0.5 : 0) -
    (toDayType === 'HALF' ? 0.5 : 0)
  );
}

const allowed = new Set(['Draft', 'REJECTED']);

const validFiles = (files) => {
  const extensions = new Set([
    'jpg',
    'jpeg',
    'png',
    'gif',
    'txt',
    'doc',
    'docx',
    'pdf',
    'xls',
    'xlsx',
    'csv',
    'html',
    'ppt',
    'pptx',
    'odt',
    'xml',
  ]);

  if (!files?.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Validation failed', [
      {
        field: 'files',
        message: 'At least one attachment is required',
      },
    ]);
  }

  for (const f of files) {
    const ext = f.originalname?.split('.').pop()?.toLowerCase();

    if (!extensions.has(ext) || !f.buffer?.length) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Validation failed', [
        {
          field: 'files',
          message: 'Invalid attachment',
        },
      ]);
    }
  }
};

// Map Oracle row to API response.
const toItem = (r) => ({
  headerId: r.HEADER_ID,
  empId: r.EMP_ID,
  empName: r.EMP_NAME,
  leaveType: r.LEAVE_TYPE,
  fromDate: r.FROM_DATE_ISO,
  toDate: r.TO_DATE_ISO,
  days: r.LEAVE_DAYS,
  status: r.STATUS,
  createdAt: r.CREATED_AT,
  pendingAt: null,
});

export function createSickLeaveService({
  repository = repo,
  withConnection = defaultRead,
  withTransaction = defaultWrite,
  storage,
  hrCheck = async () => false,
} = {}) {
  const read = (cb) => withConnection(POOLS.LOW, cb);

  const write = (cb) => withTransaction(POOLS.LOW, cb);

  // Resolve authenticated user's employee number.
  async function identity(connection, actor) {
    const self = await repository.resolveSelf(connection, actor.userId);

    if (!self) throw deny();

    return self;
  }

  // Employee or creator can access record.
  // HR privilege is determined by existing RBAC.
  async function permitted(connection, actor, header) {
    const self = await identity(connection, actor);

    const hr = await hrCheck(actor);

    if (
      !hr &&
      String(header.EMP_ID) !== self &&
      String(header.CREATED_BY) !== String(actor.userId)
    ) {
      throw missing();
    }

    return hr;
  }

  // Recompute all server-owned fields.
  async function prepare(connection, actor, body) {
    const days = calculateDays(body);

    const self = await identity(connection, actor);

    const emp = await repository.findEmployee(connection, body.empNumber, self);

    if (!emp) {
      throw new AppError(404, 'NOT_FOUND', 'Employee not found');
    }

    if (!(await repository.leaveTypeExists(connection, body.leaveType))) {
      throw bad('Invalid leave type');
    }

    return {
      ...body,
      empName: emp.empName,
      days,
      createdBy: actor.userId,
    };
  }

  // Save attachment rows and files.
  async function persistFiles(connection, headerId, files, saved) {
    for (const f of files) {
      const fileName = f.originalname.replace(/[^A-Za-z0-9._-]/g, '_');

      const attachmentId = await repository.addAttachment(connection, {
        headerId,
        uuid: randomUUID(),
        fileName,
      });

      saved.push({
        attachmentId,
        fileName,
      });

      await storage.save({
        attachmentId,
        fileName,
        buffer: f.buffer,
      });
    }
  }

  // Cleanup on failed creation or upload.
  async function cleanup(saved) {
    await Promise.allSettled(saved.map((f) => storage.remove(f)));
  }

  return {
    // CREATE SICK LEAVE
    async create(actor, body, files) {
      validFiles(files);

      const saved = [];

      try {
        return await write(async (connection) => {
          await repository.ensureWriteSchema(connection);

          const data = await prepare(connection, actor, body);

          const headerId = await repository.insert(connection, {
            ...data,
            uuid: randomUUID(),
          });

          await persistFiles(connection, headerId, files, saved);

          return {
            headerId,
            days: data.days,
            attachments: saved,
          };
        });
      } catch (error) {
        await cleanup(saved);
        throw error;
      }
    },

    // GET SICK LEAVE
    async get(actor, id) {
      return read(async (connection) => {
        const header = await repository.header(connection, id);

        if (!header) throw missing();

        await permitted(connection, actor, header);

        const capability = await repository.capabilities(connection);

        if (!capability.dayTypes) {
          throw new AppError(
            503,
            'SCHEMA_UNVERIFIED',
            'Half-day persistence columns are unavailable',
          );
        }

        const detail = await repository.header(connection, id, false, true);

        return {
          ...toItem(detail),
          comments: detail.COMMENTS,
          fromDayType: detail.FROM_DAY_TYPE,
          toDayType: detail.TO_DAY_TYPE,
          attachments: await repository.attachments(connection, id),
        };
      });
    },

    // UPDATE SICK LEAVE
    async update(actor, id, body) {
      return write(async (connection) => {
        await repository.ensureWriteSchema(connection);

        const header = await repository.header(connection, id, true);

        if (!header) throw missing();

        await permitted(connection, actor, header);

        if (!allowed.has(header.STATUS)) {
          throw conflict(header.STATUS);
        }

        const data = await prepare(connection, actor, body);

        const changed = await repository.update(connection, {
          ...data,
          headerId: id,
        });

        if (!changed) {
          throw conflict(header.STATUS);
        }

        return {
          headerId: Number(id),
          days: data.days,
        };
      });
    },

    // DELETE SICK LEAVE
    async remove(actor, id) {
      const deleted = [];

      const result = await write(async (connection) => {
        const header = await repository.header(connection, id, true);

        if (!header) throw missing();

        const hr = await permitted(connection, actor, header);

        // Delete allowed for HR or creator only.
        if (!hr && String(header.CREATED_BY) !== String(actor.userId)) {
          throw deny();
        }

        if (!allowed.has(header.STATUS)) {
          throw conflict(header.STATUS);
        }

        deleted.push(...(await repository.attachments(connection, id)));

        await repository.deleteHeader(connection, id);

        return {
          headerId: Number(id),
          deleted: true,
        };
      });

      // Remove files after committed database transaction.
      await Promise.allSettled(
        deleted.map((file) =>
          storage.remove({
            attachmentId: file.ATTACHMENT_ID,
            fileName: file.FILE_NAME,
          }),
        ),
      );

      return result;
    },

    // LIST SICK LEAVES
    async list(actor, query) {
      if (query.from && query.to && query.to < query.from) {
        throw bad('Invalid listing date range');
      }

      return read(async (connection) => {
        const self = await identity(connection, actor);

        const privileged = await hrCheck(actor);

        const { items, total } = await repository.list(connection, {
          self,
          userId: actor.userId,
          privileged,
          q: query,
        });

        return {
          items: items.map((item) => ({
            ...toItem(item),
            totalLeaveDays: privileged ? item.TOTAL_LEAVE_DAYS : null,
          })),
          page: query.page,
          pageSize: query.pageSize,
          total,
        };
      });
    },

    // EMPLOYEE LOOKUP
    async employees(actor, query) {
      return read(async (connection) =>
        repository.employees(connection, await identity(connection, actor), query),
      );
    },

    // EMPLOYEE AUTOFILL
    async employee(actor, number) {
      return read(async (connection) => {
        const employee = await repository.findEmployee(
          connection,
          number,
          await identity(connection, actor),
        );

        if (!employee) {
          throw new AppError(404, 'NOT_FOUND', 'Employee not found');
        }

        return employee;
      });
    },

    // UPLOAD ATTACHMENTS
    async upload(actor, id, files) {
      validFiles(files);

      const saved = [];

      try {
        return await write(async (connection) => {
          await repository.ensureWriteSchema(connection);

          const header = await repository.header(connection, id, true);

          if (!header) throw missing();

          await permitted(connection, actor, header);

          if (!allowed.has(header.STATUS)) {
            throw conflict(header.STATUS);
          }

          await persistFiles(connection, id, files, saved);

          return {
            attachments: saved,
          };
        });
      } catch (error) {
        await cleanup(saved);
        throw error;
      }
    },

    // DELETE AN ATTACHMENT
    async removeAttachment(actor, id, attachmentId) {
      let file;

      const data = await write(async (connection) => {
        const header = await repository.header(connection, id, true);

        if (!header) throw missing();

        await permitted(connection, actor, header);

        if (!allowed.has(header.STATUS)) {
          throw conflict(header.STATUS);
        }

        file = await repository.attachment(connection, id, attachmentId);

        if (!file) {
          throw new AppError(404, 'NOT_FOUND', 'Attachment not found');
        }

        await repository.deleteAttachment(connection, id, attachmentId);

        return {
          attachmentId: Number(attachmentId),
          deleted: true,
        };
      });

      await storage.remove({
        attachmentId,
        fileName: file.FILE_NAME,
      });

      return data;
    },
  };
}
