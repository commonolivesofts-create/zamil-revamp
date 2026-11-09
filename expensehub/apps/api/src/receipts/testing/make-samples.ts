// npm run samples — writes demo receipts to docs/samples/ for manual testing of the capture screen.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../../paths';
import { jpegToPdf, SAMPLE_ZATCA, sampleReceipt } from './sample';

const dir = path.join(REPO_ROOT, 'docs', 'samples');
mkdirSync(dir, { recursive: true });

const write = (name: string, data: Buffer) => {
  writeFileSync(path.join(dir, name), data);
  process.stdout.write(`[samples] docs/samples/${name}\n`);
};

write('zatca-receipt.png', await sampleReceipt());
write('zatca-receipt.pdf', await jpegToPdf(await sampleReceipt({ format: 'jpeg' })));
write(
  'invalid-qr-receipt.png',
  await sampleReceipt({ zatca: { ...SAMPLE_ZATCA, vatNumber: '123456789012345' } }),
);
write(
  'plain-receipt.jpg',
  await sampleReceipt({
    zatca: null,
    format: 'jpeg',
    lines: [
      'CAREEM TAXI',
      'Trip receipt',
      'Date: 14/10/2026',
      'Fare                   48.00',
      'TOTAL SAR              48.00',
    ],
  }),
);
