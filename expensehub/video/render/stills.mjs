// Renders the key still frames and the storyboard PDF into video/out/.
//   node video/render/stills.mjs
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VIDEO_DIR, openPlayer } from './browser.mjs';

const OUT = join(VIDEO_DIR, 'out');
const STILLS = [
  ['capture', 13.2, 'still-1-capture-qr.png'],
  ['approval', 16.6, 'still-2-approval-chain.png'],
  ['audit', 12.6, 'still-3-audit-balanced.png'],
  ['paid', 9.6, 'still-4-paid.png'],
];

// What each scene shows (storyboard text; wording follows the features document).
const NOTES = {
  intro: 'Logo reveal, tagline “Expense claims for IPP · FPP · APP, connected to Oracle Fusion”.',
  problem: 'Before: paper/email claims, manual typing into Fusion. After: one portal from receipt to payment.',
  capture: 'Employee on desktop and phone: scans a ZATCA QR receipt, fields fill themselves (seller, VAT number, date, amount).',
  policy: 'Live policy check while typing: limits, receipt rules, duplicates, trip dates — pass / warn / block.',
  report: 'Expenses grouped into report EH-IPP-2026-000001 (SAR 450) and submitted; status Pending approval.',
  approval: 'Chain built from the Fusion supervisor hierarchy: Line Manager → level 2 → Finance Manager → Accountant, with email toasts.',
  audit: 'Accountant reduces Transport 250 → 200 with a reason; accounting preview shows Balanced; report released.',
  payables: 'Finance AP sends to Payables; duplicate check; the invoice appears in Fusion with lines, RIR Number and receipts.',
  paid: 'Hourly status sync: Invoiced → Paid, payment 104582, employee email.',
  dashboards: 'Role home pages: employee, approver, finance pipeline (sample figures).',
  integration: 'Seven BI Publisher feeds with schedules, invoices back over REST; privacy and security points.',
  closing: '480 automated tests · 15 browser tests · first live invoice · Next: UAT and go-live; end card.',
};

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const strip = (s) => s.replace(/<[^>]+>/g, '');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

await mkdir(join(OUT, 'thumbs'), { recursive: true });
const p = await openPlayer();
try {
  for (const [id, t, file] of STILLS) {
    await p.shot(p.at(id, t), join(OUT, file));
    process.stdout.write(`still ${file}\n`);
  }

  // One thumbnail per scene, at a moment where its key content is fully on screen.
  const THUMB = { intro: 5, problem: 10, capture: 13.2, policy: 9, report: 9, approval: 16.6, audit: 12.6, payables: 13.5, paid: 9.6, dashboards: 11.5, integration: 8.5, closing: 4 };
  const rows = [];
  for (const s of p.timeline) {
    const T = Math.min(s.start + s.duration - 0.6, s.start + s.contentOffset + (THUMB[s.id] ?? 5));
    const buf = await p.shot(T, join(OUT, 'thumbs', `${String(rows.length + 1).padStart(2, '0')}-${s.id}.png`));
    rows.push({ s, img: `data:image/png;base64,${buf.toString('base64')}` });
  }

  const css = await readFile(join(VIDEO_DIR, 'render', 'storyboard.css'), 'utf8');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>ExpenseHub demo storyboard</title><style>${css}</style></head><body>
<section class="cover"><div class="mark">E</div><h1>ExpenseHub — product demo</h1><p>Storyboard · 12 scenes · ${mmss(p.total)} · 1920×1080, 30 fps</p>
<p class="small">Source of truth: ExpenseHub-Features-and-Process.docx. Demo data only — fictional people, SAR amounts, no real person numbers, bank details or passwords.</p>
<table class="toc"><tr><th>#</th><th>Scene</th><th>Start</th><th>Length</th></tr>${rows.map(({ s }, i) => `<tr><td>${i + 1}</td><td>${esc(s.title)}</td><td>${mmss(s.start)}</td><td>${s.duration}s</td></tr>`).join('')}</table></section>
${rows
  .map(
    ({ s, img }, i) => `<section class="scene"><div class="head"><span class="n">${i + 1}</span><h2>${esc(s.title)}</h2><span class="time">${mmss(s.start)} – ${mmss(s.start + s.duration)} · ${s.duration}s</span></div>
<img src="${img}"><p class="note">${esc(NOTES[s.id] ?? '')}</p>
${s.captions.length ? `<ol class="caps">${s.captions.map(([c, text]) => `<li><b>${mmss(s.contentOffset + c)}</b> ${esc(strip(text))}</li>`).join('')}</ol>` : ''}
${s.highlight ? `<p class="hl">Highlight cut: ${s.highlight[0]}–${s.highlight[1]} s of the scene</p>` : ''}</section>`,
  )
  .join('')}
<section class="scene"><h2>Sound</h2><p class="note">Original music generated in code, ~108 BPM, soft pads + plucks; UI clicks on every cursor press, a whoosh on scene changes, chimes on status changes (Approved, Balanced, Paid). Music ducks under captions, fades in and out.</p></section>
</body></html>`;
  await p.page.setContent(html, { waitUntil: 'load' });
  await p.page.pdf({ path: join(OUT, 'ExpenseHub_Demo_Storyboard.pdf'), format: 'A4', landscape: true, printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  process.stdout.write(`storyboard ExpenseHub_Demo_Storyboard.pdf · total ${p.total}s\n`);
} finally {
  await p.close();
}
