// Scene 9 — Paid: Fusion pays, ExpenseHub reads it hourly, status Invoiced → Paid, employee emailed.
import { appear, pop, prog, sar } from '../lib/anim.js';
import { appWindow, badge, h, icon } from '../lib/ui.js';
import { CAST, PAYMENT, REPORT, TOTAL_AFTER_AUDIT } from './common.js';

const STEPS = ['Draft', 'Pending approval', 'Pending audit', 'Ready for payment', 'Invoiced', 'Paid'];

export default {
  id: 'paid',
  step: 7,
  title: 'Paid',
  sub: 'Fusion pays — ExpenseHub follows',
  duration: 15,
  highlight: [2, 8.5],
  sfx: [[3, 'success'], [8.4, 'notify']],
  captions: [
    [0, 'Every hour, 07:00–20:00, ExpenseHub <b>reads the invoice status</b> from Fusion'],
    [3, 'Paid in Fusion → <b>Paid</b> in ExpenseHub, with payment number and date'],
    [7.5, 'The employee gets an <b>email</b> — no chasing Finance'],
  ],
  build(root) {
    const { win, main } = appWindow('Reports', `${CAST.employee.name} · Employee`);
    root.append(win);

    const statusSlot = h('span');
    const stepper = STEPS.map((s, i) => {
      const dot = h('div', { style: { width: '34px', height: '34px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '16px', fontWeight: '800', background: '#eef1f5', color: '#5b6475', margin: '0 auto' } }, String(i + 1));
      const label = h('div', { text: s, style: { fontSize: '15px', fontWeight: '700', marginTop: '10px', color: '#5b6475', textAlign: 'center' } });
      return { el: h('div', { style: { flex: '1' } }, dot, label), dot, label };
    });
    const bar = h('div', { style: { position: 'absolute', left: '7%', right: '7%', top: '17px', height: '4px', background: '#e3e7ee', borderRadius: '4px', zIndex: '0' } }, h('div.fill', { style: { height: '100%', width: '0%', background: '#0e7a5f', borderRadius: '4px' } }));
    const stepRow = h('div', { style: { position: 'relative', display: 'flex', marginTop: '26px' } }, bar, ...stepper.map((s) => Object.assign(s.el, { style: `flex:1;position:relative;z-index:1` })));

    const payment = h(
      'div',
      { style: { display: 'flex', gap: '40px', marginTop: '30px', padding: '22px 24px', borderRadius: '16px', background: '#e3f6ec' } },
      ...[
        ['Payment number', PAYMENT.number],
        ['Payment date', PAYMENT.date],
        ['Paid by', 'Oracle Fusion Payables · EFT'],
      ].map(([k, v]) => h('div', {}, h('div.label', { text: k }), h('div', { text: v, style: { fontSize: '24px', fontWeight: '800', color: '#0f7a4a' } }))),
    );
    const card = h(
      'div.card.pad',
      { style: { width: '1000px' } },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '18px' } },
        h('div', { style: { flex: '1' } }, h('div.mono', { text: REPORT, style: { fontSize: '30px', fontWeight: '800' } }), h('div', { text: `Riyadh client visit · ${sar(TOTAL_AFTER_AUDIT)} approved`, style: { fontSize: '19px', color: '#5b6475', marginTop: '6px' } })),
        statusSlot,
      ),
      stepRow,
      payment,
    );
    const refresh = h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', color: '#5b6475', fontSize: '17px', marginTop: '18px' } }, icon('sync', 20), h('span.rf'));
    main.append(h('h1.page-title', { text: 'My reports' }), h('p.page-sub', { text: 'Follow every claim until it is paid.' }), card, refresh);

    // Phone with the email
    const mail = h(
      'div',
      { style: { position: 'absolute', left: '16px', right: '16px', top: '120px', background: '#fff', borderRadius: '22px', padding: '20px', boxShadow: '0 12px 30px rgba(0,0,0,.18)' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', color: '#0e7a5f', fontWeight: '800', fontSize: '15px' } }, h('div.logo-mark', { text: 'E', style: { width: '28px', height: '28px', fontSize: '15px', borderRadius: '8px' } }), 'ExpenseHub · now'),
      h('div', { text: `Paid: ${REPORT}`, style: { fontSize: '21px', fontWeight: '800', marginTop: '12px' } }),
      h('div', { text: `${sar(TOTAL_AFTER_AUDIT)} was paid to your bank account. Payment ${PAYMENT.number}.`, style: { fontSize: '17px', color: '#5b6475', marginTop: '6px', lineHeight: '1.4' } }),
    );
    const phone = h('div.phone', { style: { left: '1490px', top: '170px', zIndex: '30' } }, h('div.phone-screen', { style: { background: 'linear-gradient(160deg,#0b5d48,#13a07d)' } }, h('div.phone-notch'), h('div', { text: '09:41', style: { position: 'absolute', top: '62px', width: '100%', textAlign: 'center', color: '#fff', fontSize: '56px', fontWeight: '300' } }), mail));
    root.append(phone);

    return (t) => {
      appear(win, t, 0, 0.5, 24);
      const paid = t >= 3;
      const reached = paid ? 6 : 5;
      stepper.forEach((s, i) => {
        const done = i < reached;
        s.dot.style.background = done ? '#0e7a5f' : '#eef1f5';
        s.dot.style.color = done ? '#fff' : '#5b6475';
        s.dot.textContent = done ? '✓' : String(i + 1);
        s.label.style.color = done ? '#0f1729' : '#5b6475';
      });
      bar.firstChild.style.width = `${(4 + prog(t, 3, 3.6)) * 20}%`;
      if (paid) pop(stepper[5].dot, t, 3, 0.45);
      const label = paid ? 'Paid' : 'Invoiced';
      if (statusSlot.dataset.v !== label) {
        statusSlot.dataset.v = label;
        statusSlot.replaceChildren(badge(label, paid ? 'pass' : 'info'));
      }
      if (paid) pop(statusSlot.firstChild, t, 3, 0.45);
      appear(payment, t, 3.6, 0.5, 12);
      payment.style.display = t >= 3.4 ? 'flex' : 'none';
      refresh.querySelector('.rf').textContent = t < 3 ? 'Checking Fusion for invoice status…' : 'Status read from Fusion · just now';
      refresh.style.opacity = String(prog(t, 0.6, 1));

      const pin = prog(t, 7.4, 8.1);
      phone.style.opacity = String(pin);
      phone.style.transform = `translateY(${(1 - pin) * 90}px)`;
      appear(mail, t, 8.4, 0.5, -20);
    };
  },
};
