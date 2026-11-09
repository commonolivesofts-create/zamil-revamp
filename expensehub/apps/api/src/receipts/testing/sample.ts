// Sample receipts for tests and demos: a printed receipt (text) with an optional ZATCA QR,
// as PNG, JPEG or a one-page PDF. Uses the dev-only `qrcode` package.
import { encodeZatcaQr, type ZatcaFields } from '@expensehub/shared';
import QRCode from 'qrcode';
import sharp from 'sharp';

export const SAMPLE_ZATCA: ZatcaFields = {
  sellerName: 'Al Baik Restaurant',
  vatNumber: '300055184400003',
  timestamp: '2026-10-12T13:25:00Z',
  total: '115.00',
  vat: '15.00',
};

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A receipt image: header, lines of text, and (optionally) a ZATCA QR at the bottom. */
export async function sampleReceipt(
  options: {
    lines?: string[];
    zatca?: ZatcaFields | null;
    format?: 'png' | 'jpeg';
  } = {},
): Promise<Buffer> {
  const lines = options.lines ?? [
    'AL BAIK RESTAURANT',
    'Riyadh - King Fahd Road',
    'Date: 12/10/2026  13:25',
    'Broast meal x2        100.00',
    'VAT 15%                15.00',
    'TOTAL                 115.00',
  ];
  const zatca = options.zatca === undefined ? SAMPLE_ZATCA : options.zatca;
  const width = 640;
  const textHeight = 60 + lines.length * 44;
  const qrSize = 300;
  const height = textHeight + (zatca ? qrSize + 40 : 20);

  let qrImage = '';
  if (zatca) {
    const qr = await QRCode.toBuffer(encodeZatcaQr(zatca), {
      width: qrSize,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    qrImage = `<image x="${(width - qrSize) / 2}" y="${textHeight}" width="${qrSize}" height="${qrSize}" href="data:image/png;base64,${qr.toString('base64')}"/>`;
  }
  const text = lines
    .map(
      (line, i) =>
        `<text x="30" y="${70 + i * 44}" font-family="Arial, Helvetica, sans-serif" font-size="${i === 0 ? 32 : 26}" xml:space="preserve">${escapeXml(line)}</text>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ffffff"/>${text}${qrImage}</svg>`;
  const image = sharp(Buffer.from(svg));
  return options.format === 'jpeg'
    ? image.jpeg({ quality: 92 }).toBuffer()
    : image.png().toBuffer();
}

/** Wraps a JPEG in a minimal one-page PDF (DCTDecode image XObject). */
export async function jpegToPdf(jpeg: Buffer): Promise<Buffer> {
  const { width = 640, height = 800 } = await sharp(jpeg).metadata();
  const objects: Buffer[] = [];
  const add = (body: string | Buffer) =>
    objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'));
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  add(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  add(
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
        'latin1',
      ),
      jpeg,
      Buffer.from('\nendstream', 'latin1'),
    ]),
  );
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
  add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets: number[] = [];
  let length = parts[0]!.length;
  objects.forEach((body, i) => {
    offsets.push(length);
    const chunk = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`, 'latin1'),
      body,
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
    parts.push(chunk);
    length += chunk.length;
  });
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(length),
    '%%EOF',
  ].join('\n');
  parts.push(Buffer.from(`${xref}\n`, 'latin1'));
  return Buffer.concat(parts);
}
