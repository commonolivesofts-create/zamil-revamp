// Scene 7 — Audit: receipts side by side, reduce one line with a reason, journal re-balances.
import { appear, pop, prog, sar, tween, typed } from '../lib/anim.js';
import { appWindow, badge, cursor, h, icon, showToast, toast, zoom } from '../lib/ui.js';
import { CAST, LINES, REPORT, TOTAL, TOTAL_AFTER_AUDIT, lazy, pos } from './common.js';

const REASON = 'Receipt shows SAR 200.00';

export default {
  id: 'audit',
  step: 5,
  title: 'Audit',
  sub: 'The Accountant checks, adjusts, releases',
  duration: 22,
  highlight: [5.5, 13],
  sfx: [[10.4, 'notify'], [11, 'chime'], [15.0, 'success']],
  captions: [
    [0, 'Selected for a full audit — here by the <b>random 10 % sample</b>'],
    [3.6, 'Receipts side by side — the Accountant <b>reduces a line with a reason</b>'],
    [10, 'Totals and the <b>journal preview</b> update — debits equal credits'],
    [15.2, '<b>Release for payment</b> — the employee is told about the change'],
  ],
  build(root) {
    const { win, main } = appWindow('Audit', `${CAST.acc.name} · Accountant`);
    const zoomLayer = h('div', { style: { position: 'absolute', inset: '0' } }, win);
    root.append(zoomLayer);

    const selected = badge('Selected because: random 10 % sample', 'info');
    const head = h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '18px' } },
      h('h1.page-title', { text: REPORT, style: { margin: '0' } }),
      badge('Pending audit', 'info'),
      selected,
    );

    // Receipt viewer (left)
    const thumbs = LINES.map((l, i) =>
      h('div', { style: { width: '84px', height: '104px', borderRadius: '10px', border: `2px solid ${i === 1 ? '#0e7a5f' : '#e3e7ee'}`, background: '#fffdf8', display: 'grid', placeItems: 'center', color: '#8a93a6' } }, icon('receipt', 30)),
    );
    const bigReceipt = h(
      'div.receipt',
      { style: { width: '330px', margin: '16px auto 0' } },
      h('div.rt', { text: 'Riyadh Ride Taxi' }),
      h('div', { text: '13 Oct 2026 · Trip 4471', style: { textAlign: 'center', marginBottom: '10px' } }),
      h('div.rl', {}, h('span', { text: 'Airport → Olaya' }), h('span', { text: '200.00' })),
      h('div.rl', { style: { fontWeight: '700', borderTop: '1px dashed #bbb', paddingTop: '6px' } }, h('span', { text: 'TOTAL SAR' }), h('span', { text: '200.00' })),
    );
    const viewer = h('div.card.pad', { style: { width: '430px' } }, h('div.label', { text: 'Receipts' }), h('div', { style: { display: 'flex', gap: '12px' } }, ...thumbs), bigReceipt);

    // Lines + journal (right)
    const rows = LINES.map((l) => {
      const approved = h('td.num', { text: sar(l.amount), style: { fontWeight: '700' } });
      const tr = h('tr', {}, h('td', { text: l.type }), h('td', { text: l.merchant, style: { color: '#5b6475' } }), h('td.num', { text: sar(l.amount) }), approved);
      return { tr, approved, l };
    });
    const editor = h(
      'div',
      { style: { display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 14px', background: '#f6fbf9', border: '1.5px solid #0e7a5f', borderRadius: '14px', margin: '10px 0 4px' } },
      h('div', { style: { fontSize: '16px', fontWeight: '700', color: '#0e7a5f' } }, 'Transport'),
      h('div.input', { style: { width: '150px', height: '44px', fontSize: '18px' } }, h('span.ed-amt')),
      h('div.input', { style: { flex: '1', height: '44px', fontSize: '18px' } }, h('span.ed-reason')),
      h('button.btn.primary.ed-btn', { style: { height: '44px', fontSize: '16px' } }, 'Adjust'),
    );
    const totalEl = h('span', { style: { fontWeight: '800' } });
    const linesCard = h(
      'div.card.pad',
      { style: { flex: '1' } },
      h('div.label', { text: 'Lines' }),
      h('table.table', {}, h('tr', {}, h('th', { text: 'Type' }), h('th', { text: 'Merchant' }), h('th.num', { text: 'Claimed' }), h('th.num', { text: 'Approved' })), ...rows.map((r) => r.tr)),
      editor,
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '12px', fontSize: '20px', marginTop: '12px' } }, 'Approved total', totalEl),
    );
    const jr = (side, acc, amt) =>
      h('div', { style: { display: 'flex', gap: '14px', fontSize: '16px', padding: '6px 0', borderBottom: '1px solid #eef1f5' } }, h('span', { text: side, style: { width: '30px', fontWeight: '800', color: side === 'DR' ? '#0e7a5f' : '#1d4ed8' } }), h('span.mono', { text: acc, style: { flex: '1' } }), amt);
    const drTransport = h('span.num', { style: { fontWeight: '700' } });
    const crTotal = h('span.num', { style: { fontWeight: '700' } });
    const balanced = badge('✓ Balanced', 'pass');
    const journal = h(
      'div.card.pad',
      { style: { marginTop: '16px' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, h('div.label', { text: 'Accounting preview', style: { margin: '0' } }), balanced),
      jr('DR', LINES[0].account, h('span', { text: sar(115), style: { fontWeight: '700' } })),
      jr('DR', LINES[1].account, drTransport),
      jr('DR', LINES[2].account, h('span', { text: sar(85), style: { fontWeight: '700' } })),
      jr('CR', 'Employee liability', crTotal),
    );
    const release = h('button.btn.primary', {}, icon('check', 20), 'Release for payment');
    const right = h('div', { style: { flex: '1', display: 'flex', flexDirection: 'column' } }, linesCard, journal, h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '14px' } }, release));
    main.append(head, h('div.row', {}, viewer, right));

    const toastEl = toast('Line adjusted', `${CAST.employee.name} was told: Transport ${sar(250)} → ${sar(200)}`, 'mail');
    const toast2 = toast('Released — ready for payment', `${REPORT} · ${sar(TOTAL_AFTER_AUDIT)}`, 'check');
    const stack = h('div.toast-stack', {}, toastEl, toast2);
    root.append(stack);
    [toastEl, toast2].forEach((el) => Object.assign(el.style, { position: 'absolute', left: '0', right: '0', top: '0' }));
    const cur = cursor(root);

    const keys = lazy(() => {
      const amt = pos(editor.querySelector('.ed-amt').parentElement);
      const btn = pos(editor.querySelector('.ed-btn'));
      const rel = pos(release);
      return [
        [0.5, 900, 900],
        [3.4, ...pos(thumbs[1]), true],
        [5.2, ...amt, true],
        [7.6, amt[0] + 260, amt[1], true],
        [9.6, ...btn, true],
        [14.6, ...rel, true],
        [16.5, rel[0] - 60, rel[1] + 60],
      ];
    });
    const focus = lazy(() => pos(right, 0.5, 0.5));

    return (t) => {
      const k = keys();
      const [fx, fy] = focus();
      appear(win, t, 0, 0.5, 24);
      pop(selected, t, 0.8, 0.45);
      appear(bigReceipt, t, 3.5, 0.4, 10);

      appear(editor, t, 4.8, 0.4, 8);
      editor.querySelector('.ed-amt').textContent = t >= 5.4 ? typed('200.00', t, 5.4, 10) : '';
      editor.querySelector('.ed-reason').textContent = typed(REASON, t, 7.8, 18);
      editor.querySelector('.ed-btn').classList.toggle('pressed', t >= 9.6 && t < 9.85);
      editor.style.display = t >= 4.8 && t < 10.1 ? 'flex' : 'none';

      const adj = prog(t, 10, 10.8);
      const transport = tween(t, 10, 10.8, 250, 200);
      rows[1].approved.textContent = sar(transport);
      rows[1].approved.style.color = adj > 0 ? '#0e7a5f' : '';
      rows[1].tr.style.background = adj > 0 && t < 13 ? '#f6fbf9' : '';
      totalEl.textContent = sar(tween(t, 10, 10.8, TOTAL, TOTAL_AFTER_AUDIT));
      drTransport.textContent = sar(transport);
      crTotal.textContent = sar(tween(t, 10, 10.8, TOTAL, TOTAL_AFTER_AUDIT));
      balanced.style.opacity = t < 10 || t >= 11 ? '1' : '0.3';
      pop(balanced, t, 11, 0.45);

      release.classList.toggle('pressed', t >= 14.6 && t < 14.85);
      showToast(toastEl, t, 10.4, 14.4);
      showToast(toast2, t, 15.0, 99);
      zoom(zoomLayer, t, 10.0, 10.9, 1.18, fx, fy, 13.6, 14.3);
      cur.update(k, t);
    };
  },
};
