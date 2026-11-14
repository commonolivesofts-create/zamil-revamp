// Implements: FR-CAP-03, D-29 pluggable OCR, OQ-23 proposal — Tesseract.js running on the server
// with the English model shipped in node_modules (no receipt or request leaves the server).
import { createRequire } from 'node:module';
import path from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';

export interface OcrProvider {
  readonly name: string;
  recognize(png: Buffer): Promise<string>;
  close(): Promise<void>;
}

export class NoOcr implements OcrProvider {
  readonly name = 'none';
  async recognize(): Promise<string> {
    return '';
  }
  async close(): Promise<void> {}
}

export class TesseractOcr implements OcrProvider {
  readonly name = 'tesseract';
  private worker: Promise<Worker> | undefined;

  private start(): Promise<Worker> {
    const require = createRequire(import.meta.url);
    const langPath = path.join(
      path.dirname(require.resolve('@tesseract.js-data/eng/package.json')),
      '4.0.0_best_int',
    );
    return createWorker('eng', 1, { langPath, cacheMethod: 'none', gzip: true });
  }

  async recognize(png: Buffer): Promise<string> {
    this.worker ??= this.start();
    const worker = await this.worker;
    const { data } = await worker.recognize(png);
    return data.text;
  }

  async close(): Promise<void> {
    if (this.worker) await (await this.worker).terminate();
    this.worker = undefined;
  }
}

export function createOcr(provider: 'tesseract' | 'none'): OcrProvider {
  return provider === 'tesseract' ? new TesseractOcr() : new NoOcr();
}
