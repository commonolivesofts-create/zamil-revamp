import { randomUUID } from 'node:crypto';

import {
  POOLS,
  withConnection as defaultRead,
  withTransaction as defaultWrite,
} from '../../../database/oracle.js';
import { AppError } from '../../../shared/errors/AppError.js';

import * as repo from './businessVisaRequest.repository.js';
import { CHECKS, DATE_COLUMNS, TEXT_COLUMNS } from './businessVisaRequest.repository.js';
import { DIVISIONS } from './businessVisaRequest.validation.js';

const missing = () => new AppError(404, 'NOT_FOUND', 'Business visa request not found');
const locked = (status) =>
  new AppError(409, 'STATE_CONFLICT', `Request is ${status} and cannot be modified`);
const invalidFile = (message) =>
  new AppError(400, 'VALIDATION_ERROR', 'Validation failed', [{ field: 'file', message }]);

// Legacy upload allowed_types.
const EXTENSIONS = new Set([
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
  'ppt',
  'pptx',
  'odt',
  'xml',
]);
const safeName = (name) => name.replace(/[^A-Za-z0-9._-]/g, '_');

// Drafts and rejected requests can be changed; in-process and approved ones are read-only.
const status = (row) => String(row.STATUS ?? '').toUpperCase();
const editable = (row) => ['DRAFT', 'REJECTED'].includes(status(row));

const divisionName = (code) => DIVISIONS.find((item) => item.code === code)?.name ?? code ?? '';

export function toRequest(row) {
  const item = {
    id: String(row.HEADER_ID),
    requestNo: row.REQ_NO ?? '',
    status: status(row) || 'DRAFT',
    requestedBy: row.REQUESTED_BY ?? '',
    createdAt: row.CREATED_AT ?? null,
    divisionName: divisionName(row.DIVISION),
  };
  for (const [field, column] of Object.entries(TEXT_COLUMNS)) item[field] = row[column] ?? '';
  for (const [field, column] of Object.entries(DATE_COLUMNS)) item[field] = row[column] ?? null;
  for (const [field, [column, checked]] of Object.entries(CHECKS))
    item[field] = row[column] === checked;
  // Signature block (legacy: Noted by = DIR_NAME, Approved by = GM_NAME).
  item.notedBy = row.DIR_NAME ?? '';
  item.approvedBy = row.GM_NAME ?? '';
  return item;
}

const toDocument = (row) => ({
  lineId: String(row.LINE_ID),
  name: row.DOC_NAME ?? '',
  fileName: row.DOC_FILE_NAME ?? '',
  attachedOn: row.DOC_ATTACHED_ON ?? null,
});

export function createBusinessVisaRequestService({
  repository = repo,
  withConnection = defaultRead,
  withTransaction = defaultWrite,
  storage,
} = {}) {
  const read = (work) => withConnection(POOLS.LOW, work);
  const write = (work) => withTransaction(POOLS.LOW, work);

  async function editableHeader(connection, id) {
    const row = await repository.header(connection, id, { lock: true });
    if (!row) throw missing();
    if (!editable(row)) throw locked(status(row));
    return row;
  }

  async function assertDepartment(connection, dept) {
    if (!dept) return;

    const names = await repository.departments(connection);

    if (!names.some((name) => String(name).toUpperCase() === String(dept).toUpperCase())) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Validation failed', [
        { field: 'dept', message: 'Choose a department from the list' },
      ]);
    }
  }

  return {
    async options() {
      return read(async (connection) => ({
        divisions: DIVISIONS,
        departments: await repository.departments(connection),
      }));
    },

    async list(query) {
      return read(async (connection) => {
        const { total, items } = await repository.list(connection, query);
        return { items: items.map(toRequest), page: query.page, pageSize: query.pageSize, total };
      });
    },

    async get(id) {
      return read(async (connection) => {
        const row = await repository.header(connection, id);
        if (!row) throw missing();
        const documents = await repository.documents(connection, id);
        return { ...toRequest(row), editable: editable(row), documents: documents.map(toDocument) };
      });
    },

    async create(actor, body) {
      return write(async (connection) => {
        await assertDepartment(connection, body.dept);

        const requestedBy = await repository.requester(connection, actor.employeeNumber);

        if (!requestedBy) {
          throw new AppError(400, 'REQUESTER_NOT_FOUND', 'Requester employee record not found', [
            { field: 'requestedBy', message: 'Your employee record could not be resolved' },
          ]);
        }

        const id = await repository.insertHeader(connection, body, {
          uuid: randomUUID(),
          requestedBy,
          createdBy: actor.userId,
        });
        return { id };
      });
    },

    async update(actor, id, body) {
      return write(async (connection) => {
        await editableHeader(connection, id);
        await assertDepartment(connection, body.dept);
        await repository.updateHeader(connection, id, body, { updatedBy: actor.userId });
        return { id: String(id) };
      });
    },

    async remove(id) {
      return write(async (connection) => {
        const row = await repository.header(connection, id, { lock: true });

        if (!row) throw missing();

        const documents = await repository.documents(connection, id);
        await repository.deleteDocuments(connection, id);
        await repository.deleteHeader(connection, id);

        // Best-effort removal of the stored files after the rows are gone.
        if (storage) {
          await Promise.all(
            documents.map((document) =>
              storage
                .remove({
                  attachmentId: String(document.LINE_ID),
                  fileName: document.DOC_FILE_NAME ?? '',
                })
                .catch(() => {}),
            ),
          );
        }

        return { id: String(id) };
      });
    },

    // One document per call (legacy title + attach rows); unnamed ones get "Document - n".
    async addDocument(id, file, name) {
      if (!file?.buffer?.length) throw invalidFile('Choose a file to attach');
      const extension = file.originalname?.split('.').pop()?.toLowerCase();
      if (!EXTENSIONS.has(extension)) throw invalidFile('This file type is not allowed');
      const fileName = safeName(file.originalname);
      let saved = null;
      try {
        return await write(async (connection) => {
          await editableHeader(connection, id);
          const count = (await repository.documents(connection, id)).length;
          const docName = name || `Document - ${count + 1}`;
          const lineId = await repository.insertDocument(connection, {
            id,
            uuid: randomUUID(),
            name: docName,
            fileName,
          });
          saved = { attachmentId: lineId, fileName };
          await storage.save({ ...saved, buffer: file.buffer });
          return { lineId, name: docName, fileName };
        });
      } catch (error) {
        if (saved) await storage.remove(saved).catch(() => {});
        throw error;
      }
    },

    async removeDocument(id, lineId) {
      return write(async (connection) => {
        await editableHeader(connection, id);
        const row = await repository.document(connection, id, lineId);
        if (!row || !(await repository.deleteDocument(connection, id, lineId))) {
          throw new AppError(404, 'NOT_FOUND', 'Document not found');
        }
        await storage.remove({
          attachmentId: String(row.LINE_ID),
          fileName: row.DOC_FILE_NAME ?? '',
        });
        return { lineId: String(lineId) };
      });
    },
  };
}
