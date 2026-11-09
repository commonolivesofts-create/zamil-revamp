// Scene 3 — Capture: pick a type, snap the receipt on the phone, ZATCA QR fills the form.
import { appear, pop, prog, typed, sar } from '../lib/anim.js';
import { appWindow, badge, cursor, h, icon, showToast, toast, zoom } from '../lib/ui.js';
import { CAST, LINES, QR, lazy, pos } from './common.js';

const PURPOSE = 'Client lunch – Q4 order review';

export default {
  id: 'capture',
  step: 1,
  title: 'Capture an expense',
  sub: 'Receipt photo in, form filled out',
  duration: 26.5,
  highlight: [8.5, 15.5],
  sfx: [[4.6, 'shutter'], [10.2, 'chime'], [22.0, 'notify']],
  captions: [
    [0, 'Pick an <b>expense type</b> — each one is a Finance GL account'],
    [2.6, 'Snap the receipt on the phone — <b>photo or PDF</b>'],
    [8, 'ZATCA QR read: <b>seller, VAT number, total and date</b> filled in'],
    [16.4, 'Add the purpose — the <b>charge account</b> is built automatically'],
  ],
  build(root) {
    const { win, main } = appWindow('Expenses', `${CAST.employee.name} · Employee`);
    const zoomLayer = h('div', { style: { position: 'absolute', inset: '0' } }, win);
    root.append(zoomLayer);

    // ── Form (left) ──
    const tiles = LINES.map((l, i) =>
      h('div.tile' + (i === 0 ? '' : ''), {}, h('div.ti', {}, icon(l.icon, 22)), l.type),
    );
    const field = (label, w = '100%') => {
      const value = h('span');
      const box = h('div.input', { style: { width: w } }, value);
      return { el: h('div.field', {}, h('div.label', { text: label }), box), box, value };
    };
    const fDate = field('Date');
    const fMerchant = field('Merchant');
    const fAmount = field('Amount (SAR)');
    const fPurpose = field('Business purpose');
    const caret = h('span.caret');
    const account = h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', fontSize: '18px' } },
      badge('✓ Account', 'pass'),
      h('span.mono', { text: LINES[0].account, style: { fontSize: '19px', fontWeight: '700' } }),
    );
    const save = h('button.btn.primary', {}, icon('check', 20), 'Save expense');
    const form = h(
      'div.card.pad',
      { style: { width: '800px' } },
      h('div.label', { text: 'Expense type' }),
      h('div.tiles', { style: { marginBottom: '22px' } }, ...tiles),
      h('div.row', {}, h('div', { style: { flex: '1' } }, fDate.el), h('div', { style: { flex: '1.4' } }, fMerchant.el)),
      h('div.row', {}, h('div', { style: { flex: '1' } }, fAmount.el), h('div', { style: { flex: '1.4' } })),
      fPurpose.el,
      account,
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '14px' } }, save),
    );

    // ── Receipt pane (right) ──
    const drop = h(
      'div',
      { style: { height: '300px', border: '2px dashed #cdd4de', borderRadius: '16px', display: 'grid', placeItems: 'center', color: '#8a93a6', fontSize: '18px', textAlign: 'center' } },
      h('div', {}, icon('camera', 40), h('div', { text: 'Drop a photo or PDF' })),
    );
    const scan = h('div.scan-line');
    const qrBox = h('div.qr-box', {}, scan);
    const receipt = h(
      'div.receipt',
      { style: { width: '300px', margin: '0 auto' } },
      h('div.rt', { text: QR.seller }),
      h('div', { text: 'Riyadh · Tax invoice', style: { textAlign: 'center', marginBottom: '10px' } }),
      h('div.rl', {}, h('span', { text: 'Mixed grill ×2' }), h('span', { text: '100.00' })),
      h('div.rl', {}, h('span', { text: 'VAT 15%' }), h('span', { text: '15.00' })),
      h('div.rl', { style: { fontWeight: '700', borderTop: '1px dashed #bbb', paddingTop: '6px' } }, h('span', { text: 'TOTAL SAR' }), h('span', { text: '115.00' })),
      qrBox,
    );
    const qrBadge = badge('ZATCA QR ✓ valid', 'pass');
    const extracted = [
      ['Seller', QR.seller],
      ['VAT number', QR.vat],
      ['Total', sar(QR.total)],
      ['Date', QR.date],
    ].map(([k, v]) =>
      h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '17px', padding: '7px 0', borderBottom: '1px solid #eef1f5' } }, h('span', { text: k, style: { color: '#5b6475' } }), h('span', { text: v, style: { fontWeight: '700' } })),
    );
    const pane = h(
      'div.card.pad',
      { style: { flex: '1', position: 'relative' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' } }, h('div.label', { text: 'Receipt', style: { margin: '0' } }), qrBadge),
      drop,
      receipt,
      h('div', { style: { marginTop: '12px' } }, ...extracted),
    );
    receipt.style.position = 'absolute';
    receipt.style.left = '50%';
    receipt.style.top = '70px';
    receipt.style.marginLeft = '-150px';

    main.append(
      h('h1.page-title', { text: 'New expense' }),
      h('p.page-sub', { text: 'Pick a type, attach the receipt — ExpenseHub fills in the rest.' }),
      h('div.row', { style: { alignItems: 'stretch' } }, form, pane),
    );

    // ── Phone (camera) ──
    const flash = h('div', { style: { position: 'absolute', inset: '0', background: '#fff', opacity: '0', zIndex: '4' } });
    const upload = h('div', { style: { position: 'absolute', left: '28px', right: '28px', bottom: '70px', zIndex: '5' } },
      h('div', { text: 'Uploading to ExpenseHub…', style: { color: '#fff', fontSize: '17px', fontWeight: '700', marginBottom: '10px', textAlign: 'center' } }),
      h('div', { style: { height: '8px', borderRadius: '8px', background: 'rgba(255,255,255,.3)', overflow: 'hidden' } }, h('div.upbar', { style: { height: '100%', width: '0%', background: '#7ee2c3' } })),
    );
    const phoneReceipt = receipt.cloneNode(true);
    Object.assign(phoneReceipt.style, { position: 'absolute', left: '40px', top: '150px', width: '270px', transform: 'rotate(-4deg)', margin: '0' });
    const phone = h('div.phone', { style: { left: '1350px', top: '160px', zIndex: '30' } },
      h('div.phone-screen', { style: { background: '#1d2433' } }, h('div.phone-notch'),
        h('div', { text: 'Camera', style: { position: 'absolute', top: '58px', width: '100%', textAlign: 'center', color: '#fff', fontWeight: '700', fontSize: '18px' } }),
        phoneReceipt,
        h('div', { style: { position: 'absolute', left: '50%', bottom: '24px', width: '68px', height: '68px', marginLeft: '-34px', borderRadius: '50%', border: '5px solid #fff' } }),
        upload, flash),
    );
    root.append(phone);

    const toastEl = toast('Expense saved', `Meal · ${sar(115)} — added to your unreported expenses`, 'check');
    const stack = h('div.toast-stack', {}, toastEl);
    root.append(stack);
    const cur = cursor(root);

    const keys = lazy(() => {
      const meal = pos(tiles[0]);
      const purpose = pos(fPurpose.box, 0.3);
      const saveAt = pos(save);
      return [
        [0.4, 1100, 760],
        [1.5, ...meal, true],
        [2.4, meal[0] + 120, meal[1] + 160],
        [15.6, purpose[0] - 40, purpose[1] + 40],
        [16.3, ...purpose, true],
        [20.6, purpose[0] + 80, purpose[1] + 60],
        [21.6, ...saveAt, true],
        [23.5, saveAt[0] + 40, saveAt[1] + 50],
      ];
    });
    const formCenter = lazy(() => pos(form, 0.5, 0.42));

    return (t) => {
      const k = keys();
      const [zx, zy] = formCenter();
      appear(win, t, 0, 0.5, 24);
      tiles[0].classList.toggle('selected', t >= 1.5);

      // Phone in/out, shutter, upload bar
      const pin = prog(t, 2.6, 3.3);
      const pout = prog(t, 7.2, 7.9);
      phone.style.opacity = String(Math.min(pin, 1 - pout));
      phone.style.transform = `translateY(${(1 - pin) * 80 + pout * 80}px) rotate(${(1 - pin) * 4}deg)`;
      flash.style.opacity = String(t >= 4.6 && t < 5.1 ? 1 - (t - 4.6) / 0.5 : 0);
      upload.style.opacity = String(prog(t, 5.3, 5.6));
      upload.querySelector('.upbar').style.width = `${prog(t, 5.5, 7.0) * 100}%`;

      // Receipt lands in the pane, QR scanned
      drop.style.opacity = String(1 - prog(t, 7.4, 7.8));
      pop(receipt, t, 7.6, 0.5);
      receipt.style.transform += ' ';
      scan.style.top = `${((Math.max(0, t - 8.2) * 120) % 100)}px`;
      scan.style.opacity = t >= 8.2 && t < 10.2 ? '1' : '0';
      pop(qrBadge, t, 10.2, 0.45);
      extracted.forEach((row, i) => appear(row, t, 10.4 + i * 0.6, 0.4, 10));

      // Fields fill from the QR
      const fills = [
        [fMerchant, QR.seller, 10.6],
        [fAmount, '115.00', 11.8],
        [fDate, QR.date, 12.4],
      ];
      for (const [f, v, t0] of fills) {
        f.value.textContent = t >= t0 ? v : '';
        f.box.classList.toggle('filled', t >= t0 && t < 16);
      }
      // Purpose typing
      const typedText = typed(PURPOSE, t, 16.6, 16);
      fPurpose.value.textContent = typedText;
      if (t >= 16.4 && t < 20.4) fPurpose.box.append(caret);
      else caret.remove();
      caret.style.opacity = Math.floor(t * 2.5) % 2 ? '0' : '1';
      fPurpose.box.classList.toggle('filled', t >= 16.4 && t < 20.4);
      appear(account, t, 20.4, 0.5, 8);

      save.classList.toggle('pressed', t >= 21.6 && t < 21.85);
      showToast(toastEl, t, 22.0, 99);

      zoom(zoomLayer, t, 10.0, 11.0, 1.22, zx, zy, 15.2, 16.0);
      cur.update(k, t);
    };
  },
};
