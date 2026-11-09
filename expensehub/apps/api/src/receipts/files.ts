// Implements: D-18 / TRD §9 — receipts on the server disk, outside the web root:
// ${RECEIPTS_DIR}/YYYY/MM/<uuid>.<ext>; the DB stores the relative path. Kept forever; files of
// deleted unreported expenses move to _deleted/.
import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../lib/errors';

export type ReceiptMime = 'image/jpeg' | 'image/png' | 'application/pdf';

export const EXTENSIONS: Record<ReceiptMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

/** TRD §9: decide the type from the bytes, never from the file name. */
export function sniffMime(buffer: Buffer): ReceiptMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'image/jpeg';
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-')
    return 'application/pdf';
  return null;
}

export class ReceiptFiles {
  constructor(private readonly root: string) {}

  /** Absolute path for a stored relative path; refuses anything outside the receipts folder. */
  resolve(relativePath: string): string {
    const absolute = path.resolve(this.root, relativePath);
    if (!absolute.startsWith(path.resolve(this.root) + path.sep)) {
      throw new AppError('NOT_FOUND', 'Receipt file not found');
    }
    return absolute;
  }

  async save(buffer: Buffer, mime: ReceiptMime, at: Date): Promise<string> {
    const folder = path.join(
      String(at.getUTCFullYear()),
      String(at.getUTCMonth() + 1).padStart(2, '0'),
    );
    const relative = path.join(folder, `${randomUUID()}.${EXTENSIONS[mime]}`).replaceAll('\\', '/');
    await mkdir(path.join(this.root, folder), { recursive: true });
    await writeFile(this.resolve(relative), buffer, { flag: 'wx' });
    return relative;
  }

  /** TRD §9: an unreported expense's receipt is never destroyed, only moved aside. */
  async moveToDeleted(relativePath: string): Promise<string> {
    const target = `_deleted/${relativePath}`;
    await mkdir(path.dirname(this.resolve(target)), { recursive: true });
    await rename(this.resolve(relativePath), this.resolve(target));
    return target;
  }
}
