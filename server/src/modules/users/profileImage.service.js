import { POOLS, withConnection, withTransaction } from '../../database/oracle.js';
import { AppError } from '../../shared/errors/AppError.js';
import * as repository from './profileImage.repository.js';

const MAX_BYTES = 5 * 1024 * 1024;
const formats = [
  {
    mimeType: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  { mimeType: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mimeType: 'image/webp',
    test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

export function validateImage(file) {
  if (!file?.buffer || !file.buffer.length || file.buffer.length > MAX_BYTES) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Choose an image up to 5 MB.');
  }
  const format = formats.find(({ test }) => test(file.buffer));
  if (!format) throw new AppError(400, 'VALIDATION_ERROR', 'Use a PNG, JPEG or WebP image.');
  return format.mimeType;
}

export function createProfileImageService({ db = {}, repo = repository } = {}) {
  const read = db.withConnection ?? withConnection;
  const write = db.withTransaction ?? withTransaction;
  return Object.freeze({
    getVersion: (userId) => read(POOLS.LOW, (c) => repo.findProfileImageVersion(c, userId)),
    get: (userId) => read(POOLS.LOW, (c) => repo.findProfileImage(c, userId)),
    save: (userId, file) => {
      const mimeType = validateImage(file);
      return write(POOLS.LOW, (c) =>
        repo.saveProfileImage(c, { userId, data: file.buffer, mimeType }),
      );
    },
    remove: (userId) => write(POOLS.LOW, (c) => repo.deleteProfileImage(c, userId)),
    validateImage,
  });
}
