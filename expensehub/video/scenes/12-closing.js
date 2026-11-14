// Scene 12 — Closing: status summary, next step, end card.
import { appear, countUp, ease, pop, prog } from '../lib/anim.js';
import { h, icon } from '../lib/ui.js';

export default {
  id: 'closing',
  title: 'Where we are',
  duration: 11,
  highlight: [0, 5],
  sfx: [[0.3, 'pop'], [0.65, 'pop'], [1.0, 'pop'], [6.2, 'swell']],
  captions: [],
  build(root) {
    const bg = h('div', { style: { position: 'absolute', inset: '0', background: 'linear-gradient(135deg,#0b5d48 0%,#0e7a5f 55%,#13a07d 100%)' } });
    const stat = (big, label, ic) => {
      const v = h('div', { style: { fontSize: '76px', fontWeight: '800', letterSpacing: '-0.03em' } });
      const el = h('div', { style: { width: '460px', padding: '34px', borderRadius: '26px', background: 'rgba(255,255,255,.12)', color: '#fff', textAlign: 'center' } }, h('div', { style: { opacity: '.9' } }, icon(ic, 40)), v, h('div', { text: label, style: { fontSize: '24px', fontWeight: '600', opacity: '.92' } }));
      return { el, v, big };
    };
    const s1 = stat(480, 'automated tests passing', 'check');
    const s2 = stat(15, 'end-to-end browser tests', 'shield');
    const s3 = stat(null, 'first live invoice in Oracle Fusion', 'bank');
    s3.v.textContent = '✓';
    const row = h('div', { style: { position: 'absolute', left: '0', right: '0', top: '200px', display: 'flex', justifyContent: 'center', gap: '36px' } }, s1.el, s2.el, s3.el);
    const next = h('div', { style: { position: 'absolute', left: '0', right: '0', top: '600px', textAlign: 'center', color: '#fff' } }, h('div', { text: 'NEXT', style: { fontSize: '24px', fontWeight: '800', letterSpacing: '.3em', opacity: '.75' } }), h('div', { text: 'User acceptance testing and go-live', style: { fontSize: '58px', fontWeight: '800', marginTop: '10px' } }));
    const end = h('div', { style: { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#0b5d48 0%,#0e7a5f 55%,#13a07d 100%)' } }, h('div', { style: { textAlign: 'center', color: '#fff' } }, h('div', { text: 'E', style: { width: '140px', height: '140px', margin: '0 auto', borderRadius: '38px', background: '#fff', color: '#0e7a5f', display: 'grid', placeItems: 'center', fontSize: '86px', fontWeight: '800' } }), h('div', { text: 'ExpenseHub', style: { fontSize: '96px', fontWeight: '800', letterSpacing: '-0.035em', marginTop: '20px' } }), h('div', { text: 'Zamil Plastic Industries · IPP · FPP · APP', style: { fontSize: '30px', opacity: '.85', marginTop: '10px' } })));
    root.append(bg, row, next, end);

    return (t) => {
      [s1, s2, s3].forEach((s, i) => pop(s.el, t, 0.3 + i * 0.35, 0.5));
      s1.v.textContent = countUp(t, 0.4, 2.0, 0, 480);
      s2.v.textContent = countUp(t, 0.8, 2.2, 0, 15);
      appear(next, t, 2.6, 0.6, 20);
      const ke = prog(t, 6.2, 7.0, ease.inOut);
      end.style.opacity = String(ke);
      end.style.transform = `scale(${1.04 - 0.04 * ke})`;
    };
  },
};
