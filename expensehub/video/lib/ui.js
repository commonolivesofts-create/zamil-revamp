// Tiny DOM builders for the simulated ExpenseHub screens (demo data only).
import { appear, clamp, cursorAt, prog } from './anim.js';

/** h('div.card.big', {style}, children…) */
export function h(spec, attrs = {}, ...children) {
  const [tag, ...classes] = spec.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Inline SVG icons (simple strokes, Lucide-like). */
const PATHS = {
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 3l10 18H2zM12 10v4M12 17v.5',
  x: 'M6 6l12 12M18 6L6 18',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  home: 'M3 11l9-7 9 7v9H3z',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2M18 12h2M12 4v2M12 18v2',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  camera: 'M4 7h4l2-3h4l2 3h4v12H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3z',
  send: 'M3 11l18-8-8 18-2-8z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 3',
  sync: 'M4 12a8 8 0 0114-5l2 2M20 12a8 8 0 01-14 5l-2-2M18 4v5h-5M6 20v-5h5',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
  db: 'M4 6c0-2 16-2 16 0v12c0 2-16 2-16 0zM4 6c0 2 16 2 16 0M4 12c0 2 16 2 16 0',
  plane: 'M2 13l20-8-6 16-4-6z',
  car: 'M4 16v-4l2-5h12l2 5v4zM7 16v2M17 16v2M6 12h12',
  utensils: 'M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M16 3c-2 0-3 3-3 6s1 4 3 4v8',
  briefcase: 'M3 8h18v12H3zM9 8V5h6v3',
  arrow: 'M5 12h14M13 6l6 6-6 6',
};
export function icon(name, size = 22, cls = '') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (cls) svg.setAttribute('class', cls);
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', PATHS[name] ?? PATHS.file);
  svg.append(p);
  return svg;
}

export const badge = (text, tone = 'neutral') => h(`span.badge.${tone}`, { text });

/** The ExpenseHub browser window with sidebar; returns {win, main, setActive}. */
export function appWindow(active = 'Home', user = 'Omar Haddad · Employee') {
  const nav = ['Home', 'Expenses', 'Reports', 'Approvals', 'Audit', 'Payables', 'Setup'];
  const icons = ['home', 'receipt', 'file', 'inbox', 'shield', 'bank', 'settings'];
  const items = nav.map((n, i) => h('div.nav-item' + (n === active ? '.active' : ''), {}, icon(icons[i], 20), n));
  const main = h('div.app-main');
  const win = h(
    'div.window',
    {},
    h('div.chrome', {}, h('span.dot.r'), h('span.dot.y'), h('span.dot.g'), h('div.url', { text: 'expensehub.zpi.local' })),
    h(
      'div.app',
      {},
      h('aside.sidebar', {}, h('div.brand', {}, h('div.logo-mark', { text: 'E' }), 'ExpenseHub'), ...items),
      h('div.app-body', {}, h('header.topbar', {}, h('div.search', { text: 'Search reports, expenses…' }), h('div.me', {}, h('div.avatar', { text: initials(user) }), user)), main),
    ),
  );
  return { win, main, items };
}
const initials = (s) => s.split(/[\s·]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');

/** Animated mouse cursor with click ripple. */
export function cursor(parent) {
  const el = h('div.cursor', {}, h('div.ripple'));
  el.append(
    (() => {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '34');
      svg.setAttribute('height', '34');
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', 'M3 2l7 19 2.5-7.5L20 11z');
      p.setAttribute('fill', '#0f1729');
      p.setAttribute('stroke', '#fff');
      p.setAttribute('stroke-width', '1.6');
      p.setAttribute('stroke-linejoin', 'round');
      svg.append(p);
      return svg;
    })(),
  );
  parent.append(el);
  return {
    el,
    update(keys, t) {
      const { x, y, clickAge } = cursorAt(keys, t);
      // Record click times (global seconds) so the audio pass can place a click sound on each.
      if (window.__clicks && window.__base != null) for (const k of keys) if (k[3]) window.__clicks.add(Math.round((window.__base + k[0]) * 1000) / 1000);
      el.style.transform = `translate(${x}px, ${y}px)`;
      const ripple = el.firstChild;
      const k = clickAge < 0.5 ? clickAge / 0.5 : 1;
      ripple.style.opacity = String(clickAge < 0.5 ? 1 - k : 0);
      ripple.style.transform = `translate(-50%, -50%) scale(${0.3 + k * 1.4})`;
      el.style.opacity = String(prog(t, keys[0][0] - 0.3, keys[0][0]));
    },
  };
}

/** Email / notification toast that slides in from the right. */
export function toast(title, body, iconName = 'mail') {
  return h('div.toast', {}, h('div.toast-icon', {}, icon(iconName, 22)), h('div', {}, h('div.toast-title', { text: title }), h('div.toast-body', { text: body })));
}
export function showToast(el, t, t0, t1) {
  const kin = prog(t, t0, t0 + 0.45);
  const kout = prog(t, t1, t1 + 0.4);
  el.style.opacity = String(clamp(kin - kout));
  el.style.transform = `translateX(${(1 - kin) * 60 + kout * 60}px)`;
}

/** Zoom-in on a region of the stage: scale around (cx, cy). */
export function zoom(el, t, t0, t1, scale, cx, cy, t2 = Infinity, t3 = Infinity) {
  const kin = prog(t, t0, t1, (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2));
  const kout = prog(t, t2, t3);
  const s = 1 + (scale - 1) * (kin - kout);
  el.style.transformOrigin = `${cx}px ${cy}px`;
  el.style.transform = `scale(${s})`;
}

export { appear };
