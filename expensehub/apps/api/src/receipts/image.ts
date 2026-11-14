// Image work for receipts (TRD §9): strip metadata (EXIF GPS), render PDF page 1, find QR codes.
import { createCanvas } from '@napi-rs/canvas';
import jsQR from 'jsqr';
import sharp from 'sharp';
import type { ReceiptMime } from './files';

/**
 * TRD §9: re-encode images so EXIF (incl. GPS) is dropped; the orientation is applied first so
 * the stored picture still looks right. PDFs are stored as uploaded.
 */
export async function sanitize(buffer: Buffer, mime: ReceiptMime): Promise<Buffer> {
  if (mime === 'application/pdf') return buffer;
  const image = sharp(buffer, { failOn: 'error' }).rotate();
  return mime === 'image/png'
    ? image.png().toBuffer()
    : image.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

/** TRD §9: PDF → render page 1 → image for QR / OCR. */
async function renderPdfFirstPage(buffer: Buffer): Promise<Buffer> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context as never, canvas: canvas as never, viewport })
      .promise;
    return canvas.toBuffer('image/png');
  } finally {
    await doc.destroy();
  }
}

/** A PNG of the receipt (page 1 for PDFs), or null when it cannot be read. */
export async function rasterize(buffer: Buffer, mime: ReceiptMime): Promise<Buffer | null> {
  try {
    if (mime === 'application/pdf') return await renderPdfFirstPage(buffer);
    return await sharp(buffer).rotate().png().toBuffer();
  } catch {
    return null;
  }
}

async function scan(png: Buffer, width: number, preprocess: boolean): Promise<string | null> {
  let pipeline = sharp(png).resize({ width, withoutEnlargement: true });
  if (preprocess) pipeline = pipeline.grayscale().normalise();
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const code = jsQR(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
    info.width,
    info.height,
    {
      inversionAttempts: 'attemptBoth',
    },
  );
  return code?.data || null;
}

/** First QR code on the receipt; tries a few sizes because phone photos vary a lot. */
export async function findQrText(png: Buffer): Promise<string | null> {
  for (const [width, preprocess] of [
    [1600, false],
    [1000, true],
    [2400, true],
  ] as const) {
    const text = await scan(png, width, preprocess).catch(() => null);
    if (text) return text;
  }
  return null;
}
