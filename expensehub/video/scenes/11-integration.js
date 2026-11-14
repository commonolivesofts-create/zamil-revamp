// Scene 11 — Integration and security: nightly Fusion sync diagram, privacy points.
import { appear, pop, prog } from '../lib/anim.js';
import { h, icon } from '../lib/ui.js';

const FEEDS = [
  ['Employees & line managers', '01:00 nightly', 'user'],
  ['Payees (supplier · site · bank flag)', '01:00 nightly', 'bank'],
  ['Chart of accounts', '01:30 nightly', 'file'],
  ['Business trips', '02:00 nightly', 'plane'],
  ['Quick Pays', '02:00 nightly', 'receipt'],
  ['Exchange rates', '06:00 daily', 'sync'],
  ['Invoice & payment status', 'hourly 07:00–20:00', 'clock'],
];
const PRIVACY = [
  ['user', 'Each person sees only their own claims'],
  ['bank', 'No bank details stored — only a yes/no flag'],
  ['lock', 'Account locks after 5 failed sign-ins'],
  ['shield', 'Every Fusion call is logged'],
];

export default {
  id: 'integration',
  kicker: 'Under the hood',
  badge: '⇄',
  title: 'Integration & security',
  sub: 'Fusion is the source of truth',
  duration: 22,
  highlight: [1, 9],
  sfx: [[11.1, 'whoosh']],
  captions: [
    [0, 'Seven BI Publisher reports keep ExpenseHub <b>in step with Fusion</b>'],
    [7.4, 'Invoices go back to Fusion through the <b>REST API</b>'],
    [11.2, 'Private by design'],
  ],
  build(root) {
    const fusionBox = h('div.card', { style: { position: 'absolute', left: '120px', top: '190px', width: '330px', height: '560px', display: 'grid', placeItems: 'center', textAlign: 'center', background: '#f8f6f2' } }, h('div', {}, h('div', { style: { color: '#5b4b3a' } }, icon('db', 70)), h('div', { text: 'Oracle Fusion', style: { fontSize: '30px', fontWeight: '800', marginTop: '14px' } }), h('div', { text: 'HCM · GL · Payroll · Payables', style: { fontSize: '18px', color: '#6b6158', marginTop: '8px' } })));
    const hubBox = h('div.card', { style: { position: 'absolute', left: '1470px', top: '190px', width: '330px', height: '560px', display: 'grid', placeItems: 'center', textAlign: 'center', background: '#f6fbf9', borderColor: '#bfe3d6' } }, h('div', {}, h('div.logo-mark', { text: 'E', style: { width: '80px', height: '80px', fontSize: '44px', borderRadius: '22px', margin: '0 auto' } }), h('div', { text: 'ExpenseHub', style: { fontSize: '30px', fontWeight: '800', marginTop: '16px' } }), h('div', { text: 'reads nightly · never edits HR data', style: { fontSize: '18px', color: '#5b6475', marginTop: '8px' } })));
    const feeds = FEEDS.map(([name, when, ic], i) => {
      const dot = h('div', { style: { position: 'absolute', top: '50%', width: '14px', height: '14px', marginTop: '-7px', borderRadius: '50%', background: '#12a07c', boxShadow: '0 0 12px #12a07c' } });
      const lane = h('div', { style: { position: 'absolute', left: '470px', width: '980px', top: `${200 + i * 76}px`, height: '62px' } },
        h('div', { style: { position: 'absolute', left: '0', right: '0', top: '50%', height: '3px', background: '#dfe5ec' } }),
        dot,
        h('div.card', { style: { position: 'absolute', left: '260px', top: '4px', height: '54px', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '19px', fontWeight: '700' } }, icon(ic, 20), name, h('span', { text: when, style: { color: '#0e7a5f', fontWeight: '700', marginLeft: '10px', fontSize: '16px' } })));
      root.append(lane);
      return { lane, dot, i };
    });
    const back = h('div.card', { style: { position: 'absolute', left: '700px', top: '770px', padding: '14px 24px', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '12px', color: '#5b4b3a' } }, icon('send', 22), 'Invoices + receipts → Fusion Payables (REST)');
    root.append(fusionBox, hubBox, back);

    const privacy = h('div', { style: { position: 'absolute', inset: '0', background: 'rgba(243,245,248,.96)', display: 'grid', placeItems: 'center' } });
    const pCards = PRIVACY.map(([ic, text]) => h('div.card.pad', { style: { display: 'flex', alignItems: 'center', gap: '18px', width: '720px', fontSize: '26px', fontWeight: '700' } }, h('div', { style: { width: '60px', height: '60px', borderRadius: '16px', background: '#e3f4ee', color: '#0e7a5f', display: 'grid', placeItems: 'center' } }, icon(ic, 30)), text));
    privacy.append(h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px' } }, ...pCards));
    root.append(privacy);

    return (t) => {
      appear(fusionBox, t, 0, 0.5);
      appear(hubBox, t, 0.3, 0.5);
      feeds.forEach(({ lane, dot, i }) => {
        appear(lane, t, 0.8 + i * 0.5, 0.4, 0);
        const phase = ((t - 1.2 - i * 0.5) / 2.2) % 1;
        dot.style.left = `${Math.max(0, phase) * 960}px`;
        dot.style.opacity = t > 1.2 + i * 0.5 ? '1' : '0';
      });
      appear(back, t, 7.4, 0.5);
      const pin = prog(t, 11.0, 11.6);
      privacy.style.opacity = String(pin);
      privacy.style.display = pin > 0 ? 'grid' : 'none';
      pCards.forEach((c, i) => pop(c, t, 11.4 + i * 0.5, 0.45));
    };
  },
};
