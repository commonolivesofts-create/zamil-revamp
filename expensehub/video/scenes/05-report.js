// Scene 5 — Report: group unreported expenses, add a purpose, submit, number assigned.
import { appear, pop, prog, sar, typed } from '../lib/anim.js';
import { appWindow, badge, cursor, h, icon } from '../lib/ui.js';
import { CAST, LINES, REPORT, TOTAL, lazy, pos } from './common.js';

const PURPOSE = 'Riyadh client visit';

export default {
  id: 'report',
  step: 3,
  title: 'Build and submit a report',
  sub: 'Group expenses, add a purpose, submit',
  duration: 16,
  highlight: [5.5, 11],
  sfx: [[8.2, 'success']],
  captions: [
    [0, 'Group <b>unreported expenses</b> into one report'],
    [4.4, 'Add the business purpose and <b>submit</b> — every line is re-checked'],
    [9.4, 'Numbered <b>EH-&lt;BU&gt;-&lt;YYYY&gt;-&lt;6 digits&gt;</b> — here ' + REPORT],
  ],
  build(root) {
    const { win, main } = appWindow('Expenses', `${CAST.employee.name} · Employee`);
    root.append(win);
    const boxes = LINES.map(() => h('div', { style: { width: '26px', height: '26px', borderRadius: '8px', border: '2px solid #cdd4de', display: 'grid', placeItems: 'center', color: '#fff' } }));
    const rows = LINES.map((l, i) =>
      h('tr', {}, h('td', {}, boxes[i]), h('td', {}, h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '700' } }, icon(l.icon, 20), l.type)), h('td', { text: l.merchant }), h('td', { text: l.date }), h('td.num', { text: sar(l.amount), style: { fontWeight: '700' } }), h('td', {}, badge('Receipt ✓', 'pass'))),
    );
    const create = h('button.btn.primary', {}, icon('file', 20), 'Create report');
    const list = h(
      'div.card.pad',
      {},
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } }, h('div.label', { text: 'Unreported expenses', style: { margin: '0' } }), create),
      h('table.table', {}, h('tr', {}, h('th'), h('th', { text: 'Type' }), h('th', { text: 'Merchant' }), h('th', { text: 'Date' }), h('th.num', { text: 'Amount' }), h('th', { text: 'Receipt' })), ...rows),
    );

    // Report drawer
    const purposeVal = h('span');
    const purposeBox = h('div.input', {}, purposeVal);
    const submit = h('button.btn.primary', {}, icon('send', 20), 'Submit for approval');
    const titleEl = h('div', { text: 'Draft report', style: { fontSize: '30px', fontWeight: '800' } });
    const statusSlot = h('span');
    const drawer = h(
      'div.card',
      { style: { position: 'absolute', right: '0', top: '0', bottom: '0', width: '620px', borderRadius: '0', padding: '30px', boxShadow: '-20px 0 50px rgba(15,23,41,.12)' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, titleEl, statusSlot),
      h('div.field', { style: { marginTop: '24px' } }, h('div.label', { text: 'Business purpose' }), purposeBox),
      ...LINES.map((l) => h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '19px', padding: '12px 0', borderBottom: '1px solid #eef1f5' } }, h('span', { text: `${l.type} · ${l.merchant}` }), h('span', { text: sar(l.amount), style: { fontWeight: '700' } }))),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '24px', fontWeight: '800', padding: '18px 0' } }, h('span', { text: 'Total' }), h('span', { text: sar(TOTAL) })),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, submit),
    );
    main.append(h('h1.page-title', { text: 'My expenses' }), h('p.page-sub', { text: 'Select expenses to put on a report.' }), list, drawer);
    const cur = cursor(root);
    const keys = lazy(() => [
      [0.5, 1100, 900],
      ...boxes.map((b, i) => [1.2 + i * 0.6, ...pos(b), true]),
      [3.4, ...pos(create), true],
      [4.6, ...pos(purposeBox, 0.25), true],
      [7.8, ...pos(submit), true],
      [9.6, pos(submit)[0] - 80, pos(submit)[1] + 80],
    ]);

    return (t) => {
      const k = keys();
      appear(win, t, 0, 0.5, 24);
      boxes.forEach((b, i) => {
        const on = t >= 1.2 + i * 0.6;
        b.style.background = on ? '#0e7a5f' : '#fff';
        b.style.borderColor = on ? '#0e7a5f' : '#cdd4de';
        b.textContent = on ? '✓' : '';
        rows[i].style.background = on ? '#f6fbf9' : '';
      });
      create.classList.toggle('pressed', t >= 3.4 && t < 3.65);
      const din = prog(t, 3.6, 4.2);
      drawer.style.transform = `translateX(${(1 - din) * 660}px)`;
      drawer.style.opacity = String(din);
      purposeVal.textContent = typed(PURPOSE, t, 4.8, 12);
      purposeBox.classList.toggle('filled', t >= 4.6 && t < 7.6);
      submit.classList.toggle('pressed', t >= 7.8 && t < 8.05);
      const submitted = t >= 8.2;
      titleEl.textContent = submitted ? REPORT : 'Draft report';
      titleEl.className = submitted ? 'mono' : '';
      if (submitted) pop(titleEl, t, 8.2, 0.5);
      const label = submitted ? 'Pending approval' : 'Draft';
      if (statusSlot.dataset.v !== label) {
        statusSlot.dataset.v = label;
        statusSlot.replaceChildren(badge(label, submitted ? 'warn' : 'neutral'));
      }
      cur.update(k, t);
    };
  },
};
