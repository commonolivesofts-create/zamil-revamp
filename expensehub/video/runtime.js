// Timeline runtime: mounts every scene once and draws the frame for any global time T.
// window.renderAt(T) is what the headless renderer calls for each frame (deterministic).
import { clamp, prog } from './lib/anim.js';
import { h } from './lib/ui.js';
import { SCENES } from './scenes/index.js';

const TITLE_CARD = 1.9; // seconds the title card is fully shown at the start of a scene
const FADE = 0.35;

const stage = document.querySelector('.stage');
let start = 0;
const mounted = SCENES.map((scene) => {
  const root = h('div.scene');
  const content = h('div.scene-content', { style: { position: 'absolute', inset: '0' } });
  root.append(content);
  const update = scene.build(content);

  // Process scenes show "Step n"; overview scenes give their own kicker and badge text.
  const kicker = scene.kicker ?? (scene.step ? `Step ${scene.step}` : null);
  const badgeText = scene.badge ?? (scene.step ? String(scene.step) : null);
  let chip = null;
  if (kicker) {
    chip = h(
      'div.step-chip',
      {},
      h('div.num', { text: badgeText }),
      h('div', {}, h('span.kicker', { text: kicker }), scene.title),
    );
    root.append(chip);
  }
  const caption = h('div.caption');
  root.append(caption);

  let card = null;
  if (scene.titleCard !== false && kicker) {
    card = h(
      'div.title-card',
      {},
      h(
        'div',
        {},
        h('div.tc-step', { text: kicker }),
        h('div.tc-title', { text: scene.title }),
        scene.sub ? h('div.tc-sub', { text: scene.sub }) : null,
      ),
    );
    root.append(card);
  }
  stage.append(root);
  const entry = { scene, root, content, update, chip, caption, card, start };
  start += scene.duration;
  return entry;
});
export const TOTAL = start;

/** Local content time starts after the title card (if any). */
const offset = (m) => (m.card ? TITLE_CARD + 0.4 : 0);

function captionAt(scene, t) {
  let text = '';
  for (const [t0, s] of scene.captions ?? []) if (t >= t0) text = s;
  return text;
}

window.renderAt = (T) => {
  for (const m of mounted) {
    const t = T - m.start;
    const visible = t >= 0 && t < m.scene.duration;
    m.root.style.display = visible ? 'block' : 'none';
    if (!visible) continue;
    // Dip-through-canvas transition between scenes.
    const fin = m.start === 0 ? 1 : prog(t, 0, FADE);
    const fout = 1 - prog(t, m.scene.duration - FADE, m.scene.duration);
    m.root.style.opacity = String(Math.min(fin, fout));

    const lt = t - offset(m);
    window.__base = m.start + offset(m);
    m.update(Math.max(0, lt), lt);

    if (m.card) {
      const out = prog(t, TITLE_CARD, TITLE_CARD + 0.45);
      m.card.style.opacity = String(1 - out);
      m.card.style.transform = `scale(${1 + out * 0.04})`;
      m.card.style.display = out >= 1 ? 'none' : 'grid';
      const tt = m.card.querySelector('.tc-title');
      if (tt) tt.style.transform = `translateY(${(1 - prog(t, 0, 0.6)) * 24}px)`;
    }
    if (m.chip) {
      const k = prog(lt, 0, 0.5);
      m.chip.style.opacity = String(k);
      m.chip.style.transform = `translateX(${(1 - k) * -20}px)`;
    }
    const text = captionAt(m.scene, lt);
    if (m.caption.innerHTML !== text) m.caption.innerHTML = text;
    m.caption.style.display = text ? 'block' : 'none';
    // Each caption change fades in.
    const changes = (m.scene.captions ?? []).map(([c]) => c).filter((c) => c <= lt);
    const since = changes.length ? lt - Math.max(...changes) : 99;
    m.caption.style.opacity = String(clamp(since / 0.3));
  }
};

window.TIMELINE = mounted.map((m) => ({
  id: m.scene.id,
  step: m.scene.step ?? null,
  title: m.scene.title,
  start: m.start,
  duration: m.scene.duration,
  contentOffset: offset(m),
  captions: m.scene.captions ?? [],
  highlight: m.scene.highlight ?? null,
  // Sound cues in global seconds: [time, kind].
  sfx: (m.scene.sfx ?? []).map(([t, kind]) => [m.start + offset(m) + t, kind]),
}));
window.__clicks = new Set();
window.TOTAL = TOTAL;
window.ready = document.fonts.ready.then(() => true);
