// Scene 8 — Payables: Finance AP sends to Fusion; the invoice appears with receipts attached.
import { appear, pop, prog, sar } from '../lib/anim.js';
import { appWindow, badge, cursor, h, icon } from '../lib/ui.js';
import { CAST, LINES, REPORT, SUPPLIER, TOTAL_AFTER_AUDIT, lazy, pos } from './common.js';

export default {
  id: 'payables',
  step: 6,
  title: 'Send to Fusion Payables',
  sub: 'One click — the invoice is created in Fusion',
  duration: 19,
  highlight: [2.5, 11],
  sfx: [[4.2, 'chime'], [6.4, 'whoosh'], [11.6, 'pop']],
  captions: [
    [0, 'Finance AP sees it in <b>Ready for payment</b>'],
    [2.6, 'Send to Payables — a <b>duplicate check</b> first, so a double click never creates two'],
    [6.8, 'The invoice in <b>Oracle Fusion Payables</b> — one line per approved expense'],
    [11.6, 'Receipts attached · <b>RIR Number</b> = report number · Standard · Immediate · EFT'],
  ],
  build(root) {
    // ── ExpenseHub Payables page ──
    const { win, main } = appWindow('Payables', `${CAST.ap.name} · Finance AP`);
    const tabs = ['Ready for payment', 'Invoiced', 'Paid', 'Errors'].map((n, i) => {
      const count = h('span', { text: i === 0 ? '1' : '0', style: { marginLeft: '8px', color: '#5b6475' } });
      return { el: h('div', { style: { padding: '10px 20px', borderRadius: '999px', border: '1.5px solid #e3e7ee', fontSize: '18px', fontWeight: '700' } }, n, count), count };
    });
    const send = h('button.btn.primary', {}, icon('send', 20), 'Send to Payables');
    const rowStatus = h('span');
    const row = h(
      'div.card.pad',
      { style: { display: 'flex', alignItems: 'center', gap: '20px', marginTop: '22px' } },
      h('div', { style: { flex: '1' } }, h('div', { style: { fontSize: '22px', fontWeight: '800' } }, `${CAST.employee.name} `, h('span.mono', { text: `IPP · ${REPORT}`, style: { fontSize: '17px', color: '#5b6475', fontWeight: '600' } })), h('div', { text: 'Riyadh client visit · released by the Accountant', style: { fontSize: '18px', color: '#5b6475', marginTop: '4px' } })),
      h('div', { text: sar(TOTAL_AFTER_AUDIT), style: { fontSize: '26px', fontWeight: '800' } }),
      rowStatus,
      send,
    );
    main.append(h('h1.page-title', { text: 'Payables' }), h('p.page-sub', { text: 'Send approved reports to Oracle Fusion Payables and follow them until Fusion pays.' }), h('div', { style: { display: 'flex', gap: '12px' } }, ...tabs.map((x) => x.el)), row);
    root.append(win);

    // ── Fusion invoice (simulated) ──
    const field = (k, v) => h('div', { style: { padding: '10px 0' } }, h('div', { text: k, style: { fontSize: '14px', color: '#6b6158', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em' } }), h('div', { text: v, style: { fontSize: '20px', fontWeight: '700', marginTop: '4px' } }));
    const fusion = h(
      'div.window.fusion-window',
      { style: { left: '200px', top: '150px', width: '1520px', height: '790px', zIndex: '20' } },
      h('div.chrome', {}, h('span.dot.r'), h('span.dot.y'), h('span.dot.g'), h('div.url', { text: 'Oracle Fusion · Payables (test pod)' })),
      h('div.fusion-head', {}, icon('bank', 24), `Invoice ${REPORT}`, h('span', { style: { marginLeft: 'auto' } }, badge('Not validated', 'neutral'))),
      h(
        'div',
        { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0 30px', padding: '18px 32px', borderBottom: '1px solid #e7e2da' } },
        field('Supplier', `${SUPPLIER.name} (${SUPPLIER.number})`),
        field('Supplier site', SUPPLIER.site),
        field('Business unit', SUPPLIER.bu),
        field('Amount', sar(TOTAL_AFTER_AUDIT)),
        field('Invoice type', 'Standard'),
        field('Source', 'External'),
        field('Pay group', 'Employee'),
        field('Payment terms', 'Immediate'),
        field('Payment method', 'EFT'),
        field('RIR Number', REPORT),
      ),
    );
    const lineRows = LINES.map((l, i) => h('tr', {}, h('td', { text: String(i + 1) }), h('td.num', { text: sar(l.approved ?? l.amount), style: { fontWeight: '700' } }), h('td.mono', { text: l.account }), h('td', { text: `${l.type} – ${l.merchant}` })));
    const attachments = LINES.map((l) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', border: '1px solid #e7e2da', borderRadius: '12px', fontSize: '17px', fontWeight: '600' } }, icon('file', 20), l.receipt));
    fusion.append(
      h(
        'div',
        { style: { display: 'flex', gap: '30px', padding: '22px 32px' } },
        h('div', { style: { flex: '1.7' } }, h('div.label', { text: 'Lines' }), h('table.table', {}, h('tr', {}, h('th', { text: '#' }), h('th.num', { text: 'Amount' }), h('th', { text: 'Distribution' }), h('th', { text: 'Description' })), ...lineRows)),
        h('div', { style: { flex: '1' } }, h('div.label', { text: 'Attachments (from ExpenseHub)' }), h('div.col', { style: { gap: '10px' } }, ...attachments)),
      ),
    );
    root.append(fusion);
    const cur = cursor(root);
    const keys = lazy(() => [
      [0.4, 1000, 900],
      [2.4, ...pos(send), true],
      [4.4, pos(send)[0] - 120, pos(send)[1] + 120],
    ]);

    return (t) => {
      const k = keys();
      appear(win, t, 0, 0.5, 24);
      send.classList.toggle('pressed', t >= 2.4 && t < 2.65);
      const sent = t >= 4.2;
      tabs[0].count.textContent = sent ? '0' : '1';
      tabs[1].count.textContent = sent ? '1' : '0';
      tabs.forEach((x, i) => {
        const active = (i === 0 && !sent) || (i === 1 && sent);
        x.el.style.background = active ? '#e3f4ee' : '#fff';
        x.el.style.borderColor = active ? '#0e7a5f' : '#e3e7ee';
        x.el.style.color = active ? '#0e7a5f' : '#0f1729';
      });
      const label = t < 2.6 ? 'Ready for payment' : t < 4.2 ? 'Sending…' : 'Invoiced';
      if (rowStatus.dataset.v !== label) {
        rowStatus.dataset.v = label;
        rowStatus.replaceChildren(badge(label, label === 'Invoiced' ? 'info' : label === 'Sending…' ? 'neutral' : 'pass'));
      }
      if (sent) pop(rowStatus.firstChild, t, 4.2, 0.4);
      send.style.visibility = sent ? 'hidden' : 'visible';

      const fin = prog(t, 6.4, 7.2);
      fusion.style.opacity = String(fin);
      fusion.style.transform = `translateY(${(1 - fin) * 60}px) scale(${0.97 + 0.03 * fin})`;
      lineRows.forEach((r, i) => appear(r, t, 8.2 + i * 0.35, 0.35, 8));
      attachments.forEach((a, i) => appear(a, t, 11.6 + i * 0.35, 0.35, 8));
      cur.el.style.display = t < 6.4 ? 'block' : 'none';
      cur.update(k, t);
    };
  },
};
