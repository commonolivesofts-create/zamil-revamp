// Implements: FR-CAP-02/03/04, TRD §9 pipeline: check type → SHA-256 → strip metadata → store
// → QR (ZATCA) → OCR only for fields the QR did not give → save results. Synchronous (< 10 s).
import { createHash } from 'node:crypto';
import { decodeZatcaQr, type ReceiptUploadResponse, type ZatcaResult } from '@expensehub/shared';
import type { Logger } from 'pino';
import type { PersonId, ReceiptRow } from '../../data/entities';
import type { DataLayer } from '../../data/ports';
import type { Clock } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import { type ReceiptFiles, sniffMime } from '../../receipts/files';
import { findQrText, rasterize, sanitize } from '../../receipts/image';
import type { OcrProvider } from '../../receipts/ocr';
import { parseReceiptText, type OcrFields } from '../../receipts/parse-text';

export interface StoredQr {
  text: string;
  result: ZatcaResult;
}

export interface StoredOcr {
  engine: string;
  text: string;
  fields: OcrFields;
}

export const receiptUrl = (receiptId: number) => `/api/v1/receipts/${receiptId}/file`;

const EMPTY_OCR: OcrFields = { merchant: null, date: null, total: null, vat: null };

export class ReceiptService {
  constructor(
    private readonly deps: {
      data: DataLayer;
      files: ReceiptFiles;
      ocr: OcrProvider;
      clock: Clock;
      logger: Logger;
    },
  ) {}

  async upload(
    personId: PersonId,
    file: { buffer: Buffer; originalname: string },
  ): Promise<ReceiptUploadResponse> {
    const { data, files, ocr, clock, logger } = this.deps;
    const mime = sniffMime(file.buffer);
    if (!mime) throw new AppError('VALIDATION', 'Upload a JPG, PNG or PDF receipt.');

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    let stored: Buffer;
    try {
      stored = await sanitize(file.buffer, mime);
    } catch {
      throw new AppError('VALIDATION', 'This image could not be read. Try another photo or a PDF.');
    }
    const filePath = await files.save(stored, mime, clock());

    // QR first (exact), then OCR for whatever the QR did not supply (FR-CAP-03).
    const started = Date.now();
    const png = await rasterize(stored, mime);
    const qrText = png ? await findQrText(png) : null;
    const zatca = qrText ? decodeZatcaQr(qrText, clock()) : null;
    let ocrResult: StoredOcr = { engine: ocr.name, text: '', fields: EMPTY_OCR };
    const qrComplete =
      zatca?.decoded && zatca.fields.sellerName && zatca.fields.total && zatca.fields.timestamp;
    if (png && !qrComplete && ocr.name !== 'none') {
      try {
        const text = await ocr.recognize(png);
        ocrResult = { engine: ocr.name, text: text.slice(0, 4000), fields: parseReceiptText(text) };
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'OCR failed; continuing without proposals');
      }
    }
    logger.info(
      { ms: Date.now() - started, qr: Boolean(zatca?.decoded), ocr: ocrResult.engine },
      'receipt analysed',
    );

    const row = await data.withTransaction(async (r) => {
      const receipt = await r.receipts.insert(
        {
          expenseId: null,
          personId,
          filePath,
          originalName: file.originalname.slice(0, 255) || `receipt.${mime.split('/')[1]}`,
          mime,
          sizeBytes: stored.length,
          sha256,
          ocrJson: ocrResult,
          qrJson: qrText && zatca ? ({ text: qrText, result: zatca } satisfies StoredQr) : null,
          qrValid: zatca?.decoded ? (zatca.valid ? 'Y' : 'N') : null,
          qrErrors: zatca && !zatca.valid ? zatca.errors.join('; ').slice(0, 1000) : null,
          verifiedByAuditor: 'N',
          source: 'UPLOAD',
        },
        { actorId: personId },
      );
      const sameImage = [...(await r.expenses.findByReceiptHash(sha256))].some(
        (e) => e.personId === personId,
      );
      return { receipt, duplicate: sameImage };
    });

    return toUploadResponse(row.receipt, row.duplicate);
  }

  /** The stored file (caller has checked access). */
  absolutePath(receipt: ReceiptRow): string {
    return this.deps.files.resolve(receipt.filePath);
  }

  close(): Promise<void> {
    return this.deps.ocr.close();
  }
}

export function storedQr(receipt: ReceiptRow): StoredQr | null {
  return (receipt.qrJson as StoredQr | null) ?? null;
}

export function toUploadResponse(receipt: ReceiptRow, duplicate: boolean): ReceiptUploadResponse {
  const qr = storedQr(receipt);
  const ocr = (receipt.ocrJson as StoredOcr | null) ?? {
    engine: 'none',
    text: '',
    fields: EMPTY_OCR,
  };
  return {
    receiptId: receipt.receiptId,
    originalName: receipt.originalName,
    mime: receipt.mime,
    sizeBytes: receipt.sizeBytes,
    url: receiptUrl(receipt.receiptId),
    qr: {
      found: qr !== null,
      valid: qr?.result.valid ?? false,
      fields: qr?.result.decoded ? qr.result.fields : null,
      errors: qr?.result.errors ?? [],
    },
    ocr: { engine: ocr.engine, fields: ocr.fields },
    duplicate,
  };
}
