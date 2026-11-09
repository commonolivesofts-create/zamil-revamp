// FR-CAP-02/03/04, TRD §9: upload checks, QR → OCR pipeline, metadata stripping, access.
import { receiptUploadResponseSchema } from '@expensehub/shared';
import sharp from 'sharp';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { jpegToPdf, SAMPLE_ZATCA, sampleReceipt } from '../../receipts/testing/sample';
import { H, seededApp, signedIn, testClock } from '../../test-utils';

const clock = () => testClock('2026-10-18T06:00:00.000Z').clock;

function upload(agent: request.Agent, buffer: Buffer, name: string) {
  return agent.post('/api/v1/receipts').set(H).attach('file', buffer, name);
}

describe('receipt upload (Done-when: a ZATCA QR fills seller, VAT no., total, VAT)', () => {
  it('reads the ZATCA QR from a PNG photo', async () => {
    const { app } = await seededApp({ clock: clock() });
    const ahmed = await signedIn(app, '1011');
    const res = await upload(ahmed, await sampleReceipt(), 'albaik.png').expect(201);
    const body = receiptUploadResponseSchema.parse(res.body);
    expect(body.qr).toEqual({ found: true, valid: true, fields: SAMPLE_ZATCA, errors: [] });
    expect(body).toMatchObject({ mime: 'image/png', duplicate: false });
    expect(body.url).toBe(`/api/v1/receipts/${body.receiptId}/file`);
  });

  it('renders page 1 of a PDF and reads its QR', async () => {
    const { app } = await seededApp({ clock: clock() });
    const ahmed = await signedIn(app, '1011');
    const pdf = await jpegToPdf(await sampleReceipt({ format: 'jpeg' }));
    const res = await upload(ahmed, pdf, 'invoice.pdf').expect(201);
    expect(res.body).toMatchObject({ mime: 'application/pdf', qr: { found: true, valid: true } });
  });

  it('flags an invalid ZATCA QR (VAT will not be recoverable)', async () => {
    const { app } = await seededApp({ clock: clock() });
    const ahmed = await signedIn(app, '1011');
    const png = await sampleReceipt({ zatca: { ...SAMPLE_ZATCA, vatNumber: '123456789012345' } });
    const res = await upload(ahmed, png, 'bad.png').expect(201);
    expect(res.body.qr).toMatchObject({ found: true, valid: false });
    expect(res.body.qr.errors[0]).toMatch(/VAT number/);
  });

  it('checks the real file type, not the name, and the size limit', async () => {
    const { app } = await seededApp({ clock: clock(), env: { MAX_UPLOAD_MB: '1' } });
    const ahmed = await signedIn(app, '1011');
    const fake = await upload(ahmed, Buffer.from('MZ this is not an image'), 'receipt.jpg').expect(
      400,
    );
    expect(fake.body.error.message).toMatch(/JPG, PNG or PDF/);
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1_200_000)]);
    const tooBig = await upload(ahmed, big, 'big.pdf').expect(400);
    expect(tooBig.body.error.message).toMatch(/too large/);
    await ahmed.post('/api/v1/receipts').set(H).expect(400);
  });

  it('strips EXIF / GPS from photos before storing (TRD §9)', async () => {
    const { app, services } = await seededApp({ clock: clock() });
    const ahmed = await signedIn(app, '1011');
    const withGps = await sharp(await sampleReceipt({ format: 'jpeg' }))
      .withExif({
        IFD0: { Copyright: 'secret-device' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '24/1 42/1 0/1' },
      })
      .jpeg()
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();
    const res = await upload(ahmed, withGps, 'photo.jpg').expect(201);
    const row = await services.receipts['deps'].data.read((r) =>
      r.receipts.getOrThrow(res.body.receiptId),
    );
    const stored = await sharp(services.receipts.absolutePath(row)).metadata();
    expect(stored.exif).toBeUndefined();
  });
});

describe('receipt file access (TRD §9: served only after an access check)', () => {
  it('serves the file to its owner and hides it from others', async () => {
    const { app } = await seededApp({ clock: clock() });
    const ahmed = await signedIn(app, '1011');
    const { body } = await upload(ahmed, await sampleReceipt(), 'albaik.png').expect(201);

    const file = await ahmed.get(body.url).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['content-disposition']).toMatch(/^inline/);
    expect(file.headers['x-content-type-options']).toBe('nosniff');

    await request(app).get(body.url).expect(401);
    await (await signedIn(app, '1012')).get(body.url).expect(404);
    await (await signedIn(app, '1009')).get(body.url).expect(404); // admins are not Finance
  });
});

describe('OCR fallback (OQ-23: Tesseract on the server)', () => {
  it('proposes merchant, date and total when there is no QR', async () => {
    const { app } = await seededApp({ clock: clock(), env: { OCR_PROVIDER: 'tesseract' } });
    const ahmed = await signedIn(app, '1011');
    const png = await sampleReceipt({
      zatca: null,
      lines: ['CAREEM TAXI', 'Trip receipt', 'Date: 14/10/2026', 'Fare 48.00', 'TOTAL SAR 48.00'],
    });
    const res = await upload(ahmed, png, 'taxi.png').expect(201);
    expect(res.body.qr.found).toBe(false);
    expect(res.body.ocr).toMatchObject({
      engine: 'tesseract',
      fields: { merchant: 'CAREEM TAXI', date: '2026-10-14', total: '48.00' },
    });
  }, 60_000);
});
