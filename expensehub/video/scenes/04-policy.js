// Scene 4 — Live policy check: pass / warning / block as the employee types.
import { appear, prog } from '../lib/anim.js';
import { appWindow, badge, cursor, h, icon } from '../lib/ui.js';
import { CAST, LINES, lazy, pos } from './common.js';

// [rule, pass text, other level, other text, when it resolves]
const RULES = [
  ['Details', 'Purpose, merchant and amount entered', null],
  ['Date', 'Date is not in the future', 'block', 'The expense date is in the future — fix it to save', 7.6],
  ['Exchange rate', 'SAR — no conversion needed', null],
  ['Receipt', 'Receipt attached', 'warn', 'Receipt needed — attach it or the report will be audited', 99],
  ['Account', `Charged to ${LINES[1].account}`, null],
  ['Duplicate', 'No other expense with the same merchant, amount and date', null],
];

export default {
  id: 'policy',
  step: 2,
  title: 'Live policy check',
  sub: 'Every rule, checked as you type',
  duration: 17,
  highlight: [2, 10],
  sfx: [[3.2, 'alert'], [7.4, 'chime']],
  captions: [
    [0, 'Every rule is checked <b>live</b> — and again at submit'],
    [3.2, 'A <b>block</b> stops saving — here, a date in the future'],
    [7.8, 'Fixed. A <b>warning</b> is allowed — it sends the report to audit'],
    [11.5, 'Clear messages, so employees fix issues <b>before</b> they submit'],
  ],
  build(root) {
    const { win, main } = appWindow('Expenses', `${CAST.employee.name} · Employee`);
    root.append(win);

    const dateValue = h('span', { text: '14 Nov 2026' });
    const dateBox = h('div.input', {}, dateValue);
    const save = h('button.btn.primary', {}, icon('check', 20), 'Save expense');
    const form = h(
      'div.card.pad',
      { style: { width: '640px' } },
      h('div.label', { text: 'Expense type' }),
      h('div.tile.selected', { style: { marginBottom: '20px' } }, h('div.ti', {}, icon('car', 22)), 'Transport'),
      h('div.field', {}, h('div.label', { text: 'Date' }), dateBox),
      h('div.field', {}, h('div.label', { text: 'Merchant' }), h('div.input', {}, 'Riyadh Ride Taxi')),
      h('div.field', {}, h('div.label', { text: 'Amount (SAR)' }), h('div.input', {}, '250.00')),
      h('div.field', {}, h('div.label', { text: 'Business purpose' }), h('div.input', {}, 'Airport to client office')),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, save),
    );
    const rows = RULES.map(([name, passText, level, otherText]) => {
      const ic = h('div.ic');
      const msg = h('div', { style: { flex: '1' } });
      const row = h('div.check-row', {}, ic, h('div', { style: { width: '150px', fontWeight: '800' } }, name), msg);
      return { row, ic, msg, passText, level, otherText };
    });
    const summary = h('span');
    const panel = h(
      'div.card.pad',
      { style: { flex: '1' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } }, h('div.label', { text: 'Policy check', style: { margin: '0' } }), summary),
      ...rows.map((r) => r.row),
    );
    main.append(h('h1.page-title', { text: 'New expense' }), h('p.page-sub', { text: 'The checklist updates as you type.' }), h('div.row', {}, form, panel));
    const cur = cursor(root);
    const keys = lazy(() => {
      const d = pos(dateBox, 0.3);
      return [
        [0.5, 1000, 860],
        [5.6, ...d, true],
        [7.9, d[0] + 160, d[1] + 120],
      ];
    });

    const ICON = { pass: 'check', warn: 'alert', block: 'x' };
    return (t) => {
      const k = keys();
      appear(win, t, 0, 0.5, 24);
      dateValue.textContent = t >= 7.4 ? '13 Oct 2026' : '14 Nov 2026';
      dateBox.classList.toggle('filled', t >= 5.6 && t < 8.5);
      let worst = 'pass';
      rows.forEach((r, i) => {
        appear(r.row, t, 0.6 + i * 0.35, 0.35, 10);
        const other = r.level && t < RULES[i][4];
        const level = other ? r.level : 'pass';
        if (level === 'block' || (level === 'warn' && worst === 'pass')) worst = level;
        if (r.row.dataset.v !== level) {
          r.row.dataset.v = level;
          r.row.className = `check-row ${level}`;
          r.ic.replaceChildren(icon(ICON[level], 18));
          r.msg.textContent = other ? r.otherText : r.passText;
        }
        // Emphasise the block, then the warning
        const emph = (level === 'block' && t >= 3.2) || (level === 'warn' && t >= 7.8 && t < 11.5);
        r.row.style.boxShadow = emph ? `0 0 0 3px ${level === 'block' ? '#f3b4ae' : '#f2d29a'}` : '';
      });
      const label = worst === 'block' ? 'Blocked — fix to save' : worst === 'warn' ? 'Warning — allowed' : 'All clear';
      if (summary.dataset.v !== label) {
        summary.dataset.v = label;
        summary.replaceChildren(badge(label, worst));
      }
      save.style.opacity = worst === 'block' ? '0.45' : '1';
      cur.update(k, t);
    };
  },
};
