// Scene 10 — Dashboards: role-based home pages with animated charts (sample figures).
import { appear, countUp, prog, sar, tween } from '../lib/anim.js';
import { badge, h, icon } from '../lib/ui.js';

const PIPE = [
  ['Pending approval', 14],
  ['Pending audit', 5],
  ['Ready for payment', 8],
  ['Invoiced', 6],
  ['Paid', 21],
];
const BU = [
  ['IPP', 64],
  ['FPP', 29],
  ['APP', 7],
];

export default {
  id: 'dashboards',
  kicker: 'At a glance',
  badge: '★',
  title: 'Dashboards by role',
  sub: 'Each person sees what matters to them',
  duration: 16,
  highlight: [2, 9],
  sfx: [[0.2, 'pop'], [3.7, 'pop'], [7.5, 'pop']],
  captions: [
    [0, '<b>Employee</b>: my claims, amounts and where each one is'],
    [3.8, '<b>Approver</b>: what is waiting for me, and the oldest'],
    [7.6, '<b>Finance</b>: the pipeline by status and business unit'],
  ],
  build(root) {
    const panel = (title, who, iconName, x, w) =>
      h(
        'div.card.pad',
        { style: { position: 'absolute', left: `${x}px`, top: '150px', width: `${w}px`, height: '760px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' } }, h('div', { style: { width: '48px', height: '48px', borderRadius: '14px', background: '#e3f4ee', color: '#0e7a5f', display: 'grid', placeItems: 'center' } }, icon(iconName, 24)), h('div', {}, h('div', { text: title, style: { fontSize: '24px', fontWeight: '800' } }), h('div', { text: who, style: { fontSize: '16px', color: '#5b6475' } }))),
      );
    const kpi = (label) => {
      const v = h('div.kpi');
      return { el: h('div', { style: { padding: '16px 0', borderBottom: '1px solid #eef1f5' } }, v, h('div.kpi-label', { text: label })), v };
    };

    const emp = panel('Employee home', 'Omar Haddad', 'user', 120, 470);
    const e1 = kpi('Claims this year');
    const e2 = kpi('Paid to me');
    const e3 = kpi('In approval');
    const listRow = (left, sub, right) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0', borderBottom: '1px solid #eef1f5' } }, h('div', { style: { flex: '1' } }, h('div', { text: left, style: { fontSize: '16px', fontWeight: '700' } }), h('div', { text: sub, style: { fontSize: '14px', color: '#5b6475' } })), right);
    const recent = [
      listRow('Riyadh client visit', 'EH-IPP-2026-000001 · SAR 400.00', badge('Paid', 'pass')),
      listRow('Jeddah supplier audit', 'EH-IPP-2026-000014 · SAR 1,260.00', badge('Pending approval', 'warn')),
      listRow('Training materials', 'EH-IPP-2026-000019 · SAR 340.00', badge('Draft', 'neutral')),
    ];
    emp.append(e1.el, e2.el, e3.el, h('div.label', { text: 'Recent reports', style: { marginTop: '22px' } }), ...recent);

    const appr = panel('Approver home', 'Faisal Rahman', 'inbox', 620, 470);
    const a1 = kpi('Waiting for me');
    const a2 = kpi('Oldest waiting');
    const flags = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '18px' } }, ...['Over limit', 'Missing receipt', 'Foreign currency', 'Duplicate'].map((f) => h('span.badge.warn', { text: f })));
    const waiting = [
      listRow('Omar Haddad', 'Riyadh client visit · 2 days', badge('SAR 450.00', 'neutral')),
      listRow('Sara Mansour', 'Dammam site visit · 1 day', badge('SAR 780.00', 'neutral')),
      listRow('Hassan Jaber', 'Conference fees · today', badge('SAR 2,100.00', 'neutral')),
    ];
    appr.append(a1.el, a2.el, h('div.label', { text: 'Waiting — oldest first', style: { marginTop: '22px' } }), ...waiting, flags);

    const fin = panel('Finance pipeline', 'Lina Saleh · all business units', 'chart', 1120, 680);
    const maxV = Math.max(...PIPE.map(([, v]) => v));
    const bars = PIPE.map(([n, v]) => {
      const bar = h('div.bar', { style: { width: '62px', height: '0px' } });
      const val = h('div', { style: { fontSize: '18px', fontWeight: '800', textAlign: 'center', marginBottom: '6px' } });
      return { col: h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '300px', width: '100px' } }, val, bar, h('div', { text: n, style: { fontSize: '14px', color: '#5b6475', textAlign: 'center', marginTop: '8px', height: '38px' } })), bar, val, v };
    });
    const buRows = BU.map(([b, pct]) => {
      const fill = h('div', { style: { height: '100%', width: '0%', borderRadius: '8px', background: 'linear-gradient(90deg,#12a07c,#0e7a5f)' } });
      return { el: h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', marginTop: '14px', fontSize: '18px', fontWeight: '700' } }, h('span', { text: b, style: { width: '50px' } }), h('div', { style: { flex: '1', height: '18px', borderRadius: '8px', background: '#eef1f5' } }, fill), h('span', { text: `${pct} %`, style: { width: '60px', textAlign: 'right' } })), fill, pct };
    });
    fin.append(h('div.label', { text: 'Reports by status' }), h('div', { style: { display: 'flex', gap: '20px', alignItems: 'flex-end' } }, ...bars.map((b) => b.col)), h('div.label', { text: 'Amount by business unit', style: { marginTop: '22px' } }), ...buRows.map((r) => r.el));
    root.append(emp, appr, fin);

    return (t) => {
      appear(emp, t, 0, 0.5);
      e1.v.textContent = countUp(t, 0.4, 2.0, 0, 12);
      e2.v.textContent = sar(tween(t, 0.4, 2.0, 0, 6840));
      e3.v.textContent = countUp(t, 0.4, 2.0, 0, 2);
      appear(appr, t, 3.6, 0.5);
      a1.v.textContent = countUp(t, 4.0, 5.4, 0, 3);
      a2.v.textContent = `${countUp(t, 4.0, 5.4, 0, 2)} days`;
      recent.forEach((r, i) => appear(r, t, 1.8 + i * 0.25, 0.35, 8));
      waiting.forEach((r, i) => appear(r, t, 5.0 + i * 0.25, 0.35, 8));
      flags.style.opacity = String(prog(t, 5.9, 6.4));
      appear(fin, t, 7.4, 0.5);
      bars.forEach((b, i) => {
        const k = prog(t, 7.9 + i * 0.18, 9.1 + i * 0.18);
        b.bar.style.height = `${(b.v / maxV) * 230 * k}px`;
        b.val.textContent = String(Math.round(b.v * k));
      });
      buRows.forEach((r, i) => (r.fill.style.width = `${r.pct * prog(t, 9.4 + i * 0.2, 10.6 + i * 0.2)}%`));
    };
  },
};
