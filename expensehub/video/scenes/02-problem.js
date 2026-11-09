// Scene 2 — The problem and the solution.
import { appear, pop, prog } from '../lib/anim.js';
import { h, icon } from '../lib/ui.js';

export default {
  id: 'problem',
  kicker: 'Why ExpenseHub',
  badge: '?',
  title: 'The gap it fills',
  sub: 'No Fusion Expenses licence — accounting stays in Fusion',
  duration: 15,
  highlight: [1, 7],
  captions: [
    [0, 'ZPI does <b>not license Oracle Fusion Expenses</b>'],
    [3.4, '<b>ExpenseHub</b> captures, approves and audits the claims…'],
    [7.2, '…and hands them to <b>Fusion Payables</b> — accounting stays in Fusion'],
  ],
  build(root) {
    const card = (title, sub, iconName, tone) =>
      h(
        'div.card',
        { style: { position: 'absolute', width: '440px', padding: '34px', textAlign: 'center' } },
        h('div', { style: { width: '86px', height: '86px', borderRadius: '24px', margin: '0 auto', display: 'grid', placeItems: 'center', background: tone === 'x' ? '#fdecea' : tone === 'fusion' ? '#f4f1ec' : '#e3f4ee', color: tone === 'x' ? '#b42318' : tone === 'fusion' ? '#5b4b3a' : '#0e7a5f' } }, icon(iconName, 44)),
        h('div', { text: title, style: { fontSize: '32px', fontWeight: '800', marginTop: '20px' } }),
        h('div', { text: sub, style: { fontSize: '21px', color: '#5b6475', marginTop: '10px', lineHeight: '1.4' } }),
      );
    const noLicence = card('Fusion Expenses', 'Not licensed at ZPI', 'x', 'x');
    const hub = card('ExpenseHub', 'Capture · policy · approvals · audit', 'receipt', 'hub');
    const fusion = card('Oracle Fusion', 'Payables invoice · payment · General Ledger', 'bank', 'fusion');
    Object.assign(noLicence.style, { left: '180px', top: '330px' });
    Object.assign(hub.style, { left: '740px', top: '330px' });
    Object.assign(fusion.style, { left: '1300px', top: '330px' });
    const strike = h('div', { style: { position: 'absolute', left: '160px', top: '475px', height: '8px', width: '0px', background: '#b42318', borderRadius: '8px', transform: 'rotate(-8deg)', transformOrigin: 'left center' } });
    const arrow = h('div', { style: { position: 'absolute', left: '1200px', top: '470px', color: '#0e7a5f' } }, icon('arrow', 64));
    const note = h('div.card.pad', { style: { position: 'absolute', left: '560px', top: '720px', width: '800px', textAlign: 'center', fontSize: '24px', fontWeight: '600' } }, 'ExpenseHub shows a journal ', h('b', { text: 'preview' }), ' — Fusion creates the accounting.');
    root.append(noLicence, strike, hub, fusion, arrow, note);

    return (t) => {
      appear(noLicence, t, 0.2, 0.5);
      strike.style.width = `${prog(t, 1.6, 2.3) * 500}px`;
      noLicence.style.filter = t > 2.3 ? 'grayscale(1)' : '';
      noLicence.style.opacity = String(Math.min(prog(t, 0.2, 0.7), 1 - prog(t, 3.0, 3.6) * 0.6));
      pop(hub, t, 3.4, 0.55);
      arrow.style.opacity = String(prog(t, 6.6, 7.0));
      arrow.style.left = `${1196 + prog(t, 6.6, 7.2) * 12}px`;
      appear(fusion, t, 7.2, 0.55);
      appear(note, t, 9.2, 0.5);
    };
  },
};
