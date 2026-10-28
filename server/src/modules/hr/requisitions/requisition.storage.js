import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/*
 * Physical attachment storage (README §6 — owner decision: local disk, legacy './attachments/'
 * parity). Files are stored as `<attachmentId>_<sanitised name>` so identical upload names can
 * never overwrite each other and removal is exact; the DB FILE_NAME keeps the client's original
 * name (README §1.2). The database row is authoritative: removing an already-missing file is a
 * no-op. Tests inject an in-memory double instead of this adapter.
 */
export const ATTACHMENTS_DIR = path.join(process.cwd(), 'attachments');

const safeName = (fileName) => fileName.replace(/[^A-Za-z0-9._-]/g, '_');

export function createDiskStorage({ dir = ATTACHMENTS_DIR } = {}) {
  const fileOf = ({ attachmentId, fileName }) =>
    path.join(dir, `${attachmentId}_${safeName(fileName)}`);

  return {
    async save({ attachmentId, fileName, buffer }) {
      await mkdir(dir, { recursive: true });
      await writeFile(fileOf({ attachmentId, fileName }), buffer);
    },
    async remove({ attachmentId, fileName }) {
      await rm(fileOf({ attachmentId, fileName }), { force: true });
    },
  };
}
