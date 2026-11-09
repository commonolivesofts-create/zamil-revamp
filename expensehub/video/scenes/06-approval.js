// Scene 6 — Approval chain: line managers up the HCM hierarchy → Finance Manager → Accountant.
import { appear, pop, prog } from '../lib/anim.js';
import { badge, h, icon, showToast, toast } from '../lib/ui.js';
import { CAST, REPORT } from './common.js';

const NODES = [
  { who: CAST.employee.name, role: 'Submits the report', init: 'OH' },
  { who: CAST.lm1.name, role: 'Line Manager', init: 'KN' },
  { who: CAST.lm2.name, role: 'Line Manager · level 2', init: 'FR' },
  { who: CAST.fm.name, role: 'Finance Manager', init: 'LS' },
  { who: CAST.acc.name, role: 'Accountant (audit)', init: 'YK' },
];
// When each approver's step opens (content time). The Accountant step opens the audit (next scene).
const OPENS = [0.8, 2.2, 6.4, 10.6, 14.6];

export default {
  id: 'approval',
  step: 4,
  title: 'Approval chain',
  sub: 'Up the line-manager hierarchy, then Finance',
  duration: 21,
  highlight: [2, 12],
  sfx: [[0.8, 'pop'], [2.3, 'notify'], [6.4, 'chime'], [10.6, 'chime'], [14.6, 'chime']],
  captions: [
    [0, 'Built at submit from <b>HCM</b>: every line manager up to the top'],
    [6.4, 'Each approver gets an <b>email</b> — reminder after 2 days, escalation after 3'],
    [10.6, 'Then the <b>Finance Manager</b>, then the <b>Accountant</b>'],
    [15.4, 'Approve, reject with a reason, or <b>ask for information</b>'],
  ],
  build(root) {
    const W = 1600;
    const left = 160;
    const y = 300;
    const gapX = (W - 270) / (NODES.length - 1);
    const nodes = NODES.map((n, i) => {
      const el = h(
        'div.flow-node.card',
        { style: { left: `${left + i * gapX}px`, top: `${y}px` } },
        h('div.ring', { text: n.init }),
        h('div.who', { text: n.who }),
        h('div.role', { text: n.role }),
        h('div.st', { style: { marginTop: '14px', height: '34px' } }),
      );
      root.append(el);
      return el;
    });
    // Connectors
    const lines = NODES.slice(1).map((_, i) => {
      const x0 = left + i * gapX + 270;
      const base = h('div', { style: { position: 'absolute', left: `${x0}px`, top: `${y + 56}px`, width: `${gapX - 270}px`, height: '6px', borderRadius: '6px', background: '#e3e7ee' } });
      const fill = h('div', { style: { height: '100%', width: '0%', borderRadius: '6px', background: 'linear-gradient(90deg,#12a07c,#0e7a5f)' } });
      base.append(fill);
      root.append(base);
      return fill;
    });

    // Report card under the flow
    const status = h('span');
    const reportCard = h(
      'div.card.pad',
      { style: { position: 'absolute', left: '160px', top: '640px', width: '760px', display: 'flex', alignItems: 'center', gap: '20px' } },
      h('div', { style: { width: '56px', height: '56px', borderRadius: '16px', background: '#e3f4ee', color: '#0e7a5f', display: 'grid', placeItems: 'center' } }, icon('file', 28)),
      h('div', { style: { flex: '1' } }, h('div.mono', { text: REPORT, style: { fontSize: '24px', fontWeight: '800' } }), h('div', { text: 'Riyadh client visit · 3 lines · SAR 450.00', style: { fontSize: '18px', color: '#5b6475', marginTop: '4px' } })),
      status,
    );
    root.append(reportCard);

    // Inbox preview (approver's view)
    const approveBtn = h('button.btn.primary', { style: { height: '46px', fontSize: '17px' } }, icon('check', 18), 'Approve');
    const inbox = h(
      'div.card.pad',
      { style: { position: 'absolute', left: '960px', top: '640px', width: '800px' } },
      h('div.label', { text: `Approval inbox · ${CAST.lm2.name}` }),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px' } },
        h('div', { style: { flex: '1' } }, h('div', { text: `${CAST.employee.name} — ${REPORT}`, style: { fontSize: '20px', fontWeight: '800' } }), h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } }, badge('SAR 450.00', 'neutral'), badge('No flags', 'pass'))),
        h('button.btn', { style: { height: '46px', fontSize: '17px' } }, 'Ask'),
        h('button.btn', { style: { height: '46px', fontSize: '17px', color: '#b42318' } }, 'Reject'),
        approveBtn,
      ),
    );
    root.append(inbox);

    // Email toasts for each approver
    const toasts = NODES.slice(1).map((n, i) =>
      toast(i === 3 ? 'Audit request' : 'Approval request', `${REPORT} is waiting for ${n.who}`, 'mail'),
    );
    const stack = h('div.toast-stack', { style: { top: '120px' } }, ...toasts);
    // One toast at a time, always in the same spot.
    toasts.forEach((el) => Object.assign(el.style, { position: 'absolute', left: '0', right: '0', top: '0' }));
    root.append(stack);

    return (t) => {
      nodes.forEach((el, i) => {
        appear(el, t, 0.1 * i, 0.45, 20);
        const done = i === 0 ? t >= 0.8 : i < 4 && t >= OPENS[i + 1];
        const active = i > 0 && t >= OPENS[i] && !done;
        el.classList.toggle('done', done);
        el.classList.toggle('active', active);
        const st = el.querySelector('.st');
        const text = i === 0 ? (t >= 0.8 ? 'Submitted' : '') : done ? 'Approved' : active ? (i === 4 ? 'Auditing' : 'Pending') : '';
        if (st.dataset.v !== text) {
          st.dataset.v = text;
          st.replaceChildren(text ? badge(text, done ? 'pass' : i === 4 ? 'info' : 'warn') : '');
        }
        if (active || (done && i > 0)) pop(st.firstChild ?? st, t, done ? OPENS[i + 1] : OPENS[i], 0.35);
      });
      lines.forEach((fill, i) => (fill.style.width = `${prog(t, OPENS[i + 1] - 0.8, OPENS[i + 1]) * 100}%`));

      appear(reportCard, t, 0.6, 0.5);
      const label = t >= 14.6 ? 'Pending audit' : 'Pending approval';
      if (status.dataset.v !== label) {
        status.dataset.v = label;
        status.replaceChildren(badge(label, t >= 14.6 ? 'info' : 'warn'));
      }
      appear(inbox, t, 7.2, 0.5);
      approveBtn.classList.toggle('pressed', t >= 10.1 && t < 10.35);
      toasts.forEach((el, i) => showToast(el, t, OPENS[i + 1] + 0.1, OPENS[i + 1] + 3.2));
    };
  },
};
