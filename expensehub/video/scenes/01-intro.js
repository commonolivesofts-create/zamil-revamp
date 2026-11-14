// Scene 1 — Intro: logo reveal and tagline.
import { appear, ease, prog } from '../lib/anim.js';
import { h } from '../lib/ui.js';

export default {
  id: 'intro',
  title: 'ExpenseHub',
  duration: 10,
  highlight: [0, 4],
  sfx: [[0.3, 'swell']],
  captions: [],
  build(root) {
    const bg = h('div', { style: { position: 'absolute', inset: '0', background: 'linear-gradient(135deg,#0b5d48 0%,#0e7a5f 55%,#13a07d 100%)' } });
    const rings = [0, 1, 2].map((i) =>
      h('div', { style: { position: 'absolute', left: '50%', top: '42%', width: `${360 + i * 260}px`, height: `${360 + i * 260}px`, marginLeft: `${-(180 + i * 130)}px`, marginTop: `${-(180 + i * 130)}px`, borderRadius: '50%', border: '2px solid rgba(255,255,255,.14)' } }),
    );
    const mark = h('div', { text: 'E', style: { position: 'absolute', left: '50%', top: '30%', width: '170px', height: '170px', marginLeft: '-85px', borderRadius: '46px', background: '#fff', color: '#0e7a5f', display: 'grid', placeItems: 'center', fontSize: '104px', fontWeight: '800', boxShadow: '0 30px 70px rgba(0,0,0,.25)' } });
    const word = h('div', { text: 'ExpenseHub', style: { position: 'absolute', left: '0', right: '0', top: '52%', textAlign: 'center', color: '#fff', fontSize: '120px', fontWeight: '800', letterSpacing: '-0.035em' } });
    const tag = h('div', { text: 'Employee expense claims for IPP, FPP and APP — integrated with Oracle Fusion', style: { position: 'absolute', left: '0', right: '0', top: '68%', textAlign: 'center', color: 'rgba(255,255,255,.92)', fontSize: '40px', fontWeight: '500' } });
    const by = h('div', { text: 'ZAMIL PLASTIC INDUSTRIES', style: { position: 'absolute', left: '0', right: '0', bottom: '70px', textAlign: 'center', color: 'rgba(255,255,255,.7)', fontSize: '22px', fontWeight: '700', letterSpacing: '.3em' } });
    root.append(bg, ...rings, mark, word, tag, by);

    return (t) => {
      rings.forEach((r, i) => {
        const k = prog(t, 0.2 + i * 0.25, 1.6 + i * 0.25);
        r.style.opacity = String(k);
        r.style.transform = `scale(${0.6 + 0.4 * k + Math.sin(t * 0.6 + i) * 0.015})`;
      });
      const km = prog(t, 0.3, 1.2, ease.back);
      mark.style.opacity = String(Math.min(1, km * 1.4));
      mark.style.transform = `scale(${0.4 + 0.6 * km}) rotate(${(1 - km) * -12}deg)`;
      appear(word, t, 1.2, 0.7, 30);
      appear(tag, t, 2.2, 0.7, 20);
      appear(by, t, 3.0, 0.7, 10);
    };
  },
};
