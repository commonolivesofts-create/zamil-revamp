// Original soundtrack, synthesised in code (no samples): a calm 108 BPM groove plus UI sound effects.
// mix({ duration, events, lift }) → { left, right } Float32Arrays at 48 kHz.
//   events: [{ t, kind }]  kind ∈ click | whoosh | chime | notify | success | alert | pop | shutter | swell
//   lift:   [[a, b]] windows where the music comes up (title cards, intro, end) — elsewhere it sits under captions.
import { writeFile } from 'node:fs/promises';

export const RATE = 48000;
const BPM = 108;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const TAU = Math.PI * 2;
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Deterministic noise so every render sounds identical.
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

// D major, warm: Dmaj9 – Bm7 – Gmaj7 – A(add9)/C#, two bars each.
const CHORDS = [
  { root: 38, notes: [50, 54, 57, 61, 64] },
  { root: 35, notes: [50, 54, 57, 59, 62] },
  { root: 31, notes: [50, 55, 59, 62, 66] },
  { root: 33, notes: [49, 52, 57, 59, 64] },
];

class Bus {
  constructor(n) {
    this.l = new Float32Array(n);
    this.r = new Float32Array(n);
  }
  add(i, v, pan = 0) {
    if (i < 0 || i >= this.l.length) return;
    this.l[i] += v * Math.cos(((pan + 1) * Math.PI) / 4);
    this.r[i] += v * Math.sin(((pan + 1) * Math.PI) / 4);
  }
}

/** Karplus–Strong plucked string. */
function pluck(bus, t0, freq, amp, pan, noise, dur = 1.4) {
  const period = Math.max(2, Math.round(RATE / freq));
  const buf = new Float32Array(period);
  for (let i = 0; i < period; i++) buf[i] = noise() * 0.6;
  const start = Math.round(t0 * RATE);
  const len = Math.round(dur * RATE);
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const cur = buf[idx];
    const next = buf[(idx + 1) % period];
    buf[idx] = 0.4985 * (cur + next);
    const lp = prev + 0.45 * (cur - prev); // soften the attack
    prev = lp;
    bus.add(start + i, lp * amp * Math.min(1, i / 60), pan);
    idx = (idx + 1) % period;
  }
}

/** Soft pad: detuned sines with a few harmonics, slow attack and release. */
function pad(bus, t0, dur, notes, amp) {
  const start = Math.round(t0 * RATE);
  const len = Math.round((dur + 1.2) * RATE);
  const att = 0.9 * RATE;
  const rel = 1.2 * RATE;
  const body = dur * RATE;
  notes.forEach((m, n) => {
    const f = hz(m);
    const pan = (n / (notes.length - 1)) * 1.2 - 0.6;
    for (let i = 0; i < len; i++) {
      const env = Math.min(1, i / att) * (i < body ? 1 : Math.max(0, 1 - (i - body) / rel));
      if (env <= 0) continue;
      const t = i / RATE;
      const v =
        Math.sin(TAU * f * 0.997 * t) + Math.sin(TAU * f * 1.003 * t) + 0.25 * Math.sin(TAU * f * 2 * t) + 0.08 * Math.sin(TAU * f * 3 * t);
      bus.add(start + i, v * env * amp, pan);
    }
  });
}

function bass(bus, t0, midi, amp, dur = BEAT * 1.8) {
  const f = hz(midi);
  const start = Math.round(t0 * RATE);
  const len = Math.round(dur * RATE);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const env = Math.min(1, i / 200) * Math.exp(-t * 1.6);
    bus.add(start + i, (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t)) * env * amp, 0);
  }
}

function kick(bus, t0, amp) {
  const start = Math.round(t0 * RATE);
  let ph = 0;
  for (let i = 0; i < 0.35 * RATE; i++) {
    const t = i / RATE;
    ph += (TAU * (48 + 90 * Math.exp(-t * 28))) / RATE;
    bus.add(start + i, Math.sin(ph) * Math.exp(-t * 9) * amp, 0);
  }
}

function hat(bus, t0, amp, noise, pan = 0.25) {
  const start = Math.round(t0 * RATE);
  let lp = 0;
  for (let i = 0; i < 0.06 * RATE; i++) {
    const n = noise();
    lp += 0.6 * (n - lp);
    bus.add(start + i, (n - lp) * Math.exp((-i / RATE) * 70) * amp, pan);
  }
}

function tone(bus, t0, freq, amp, decay, pan = 0, { attack = 0.004, partials = [[1, 1]] } = {}) {
  const start = Math.round(t0 * RATE);
  const len = Math.round(Math.min(4, decay * 6) * RATE);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / attack) * Math.exp(-t / decay);
    let v = 0;
    for (const [mult, a] of partials) v += a * Math.sin(TAU * freq * mult * t);
    bus.add(start + i, v * env * amp, pan);
  }
}

function noiseSweep(bus, t0, dur, amp, noise, { from = 0.02, to = 0.5, panFrom = -0.6, panTo = 0.6 } = {}) {
  const start = Math.round(t0 * RATE);
  const len = Math.round(dur * RATE);
  let lp = 0;
  let lp2 = 0;
  for (let i = 0; i < len; i++) {
    const k = i / len;
    const c = from + (to - from) * Math.sin(k * Math.PI); // filter opens then closes
    lp += c * (noise() - lp);
    lp2 += c * (lp - lp2);
    const env = Math.sin(k * Math.PI) ** 2;
    bus.add(start + i, lp2 * env * amp, panFrom + (panTo - panFrom) * k);
  }
}

const BELL = [
  [1, 1],
  [2.76, 0.22],
  [5.4, 0.07],
];

function sfx(bus, { t, kind }, noise) {
  switch (kind) {
    case 'click':
      tone(bus, t, 1900, 0.12, 0.012, 0.1);
      tone(bus, t + 0.002, 900, 0.1, 0.02, 0.1);
      break;
    case 'pop':
      tone(bus, t, 660, 0.16, 0.06, 0, { partials: [[1, 1], [2, 0.2]] });
      break;
    case 'whoosh':
      noiseSweep(bus, t - 0.25, 0.75, 0.55, noise);
      break;
    case 'shutter':
      noiseSweep(bus, t, 0.05, 0.6, noise, { from: 0.5, to: 0.9, panFrom: 0, panTo: 0 });
      noiseSweep(bus, t + 0.09, 0.07, 0.5, noise, { from: 0.4, to: 0.8, panFrom: 0, panTo: 0 });
      break;
    case 'chime':
      tone(bus, t, hz(86), 0.13, 0.45, -0.15, { partials: BELL });
      tone(bus, t + 0.09, hz(93), 0.11, 0.6, 0.15, { partials: BELL });
      break;
    case 'notify':
      tone(bus, t, hz(81), 0.12, 0.25, 0.3, { partials: BELL });
      tone(bus, t + 0.12, hz(88), 0.12, 0.4, 0.3, { partials: BELL });
      break;
    case 'success':
      [74, 78, 81, 86].forEach((m, i) => tone(bus, t + i * 0.085, hz(m + 12), 0.1, 0.55, -0.3 + i * 0.2, { partials: BELL }));
      break;
    case 'alert':
      tone(bus, t, hz(67), 0.13, 0.18, 0, { partials: [[1, 1], [3, 0.15]] });
      tone(bus, t + 0.16, hz(62), 0.13, 0.28, 0, { partials: [[1, 1], [3, 0.15]] });
      break;
    case 'swell':
      noiseSweep(bus, t, 1.6, 0.25, noise, { from: 0.01, to: 0.12, panFrom: -0.3, panTo: 0.3 });
      [62, 69, 74, 78].forEach((m, i) => tone(bus, t + 0.6 + i * 0.05, hz(m + 12), 0.06, 1.1, -0.4 + i * 0.27, { attack: 0.3, partials: BELL }));
      break;
    default:
      throw new Error(`Unknown sound ${kind}`);
  }
}

/** Builds the music bed for [0, duration). */
function music(n, duration) {
  const bus = new Bus(n);
  const noise = rng(7);
  const bars = Math.ceil(duration / BAR) + 1;
  const end = duration - 2.5; // let the last chord ring out
  for (let b = 0; b < bars; b++) {
    const t0 = b * BAR;
    if (t0 > end) break;
    const chord = CHORDS[Math.floor(b / 2) % CHORDS.length];
    if (b % 2 === 0) pad(bus, t0, Math.min(BAR * 2, end - t0 + 1), chord.notes, 0.016);
    const groove = t0 >= BAR * 2 && t0 < end - BAR * 2; // first 2 bars and the tail are pad + pluck only
    const arp = [0, 2, 4, 3, 1, 3, 4, 2];
    for (let s = 0; s < 8; s++) {
      const ts = t0 + s * (BEAT / 2);
      if (ts > end) break;
      const m = chord.notes[arp[s]] + 12;
      pluck(bus, ts, hz(m), s % 2 ? 0.1 : 0.14, s % 2 ? 0.35 : -0.35, noise);
    }
    if (!groove) continue;
    bass(bus, t0, chord.root + 12, 0.12);
    bass(bus, t0 + BEAT * 2.5, chord.root + 12, 0.09);
    kick(bus, t0, 0.32);
    kick(bus, t0 + BEAT * 2, 0.26);
    for (let s = 0; s < 4; s++) hat(bus, t0 + s * BEAT + BEAT / 2, 0.06, noise);
  }
  // Light stereo echo for space.
  const d = Math.round(BEAT * 0.75 * RATE);
  for (let i = d; i < n; i++) {
    bus.l[i] += bus.r[i - d] * 0.22;
    bus.r[i] += bus.l[i - d] * 0.22;
  }
  return bus;
}

export function mix({ duration, events = [], lift = [] }) {
  const n = Math.round(duration * RATE);
  const m = music(n, duration);
  const fx = new Bus(n);
  const noise = rng(42);
  for (const e of events) if (e.t >= 0 && e.t < duration) sfx(fx, e, noise);

  // Music gain: sits under captions (0.55), comes up in lifted windows (0.85), dips under each cue,
  // fades in over 1 s and out over the last 3 s. Smoothed so changes never click.
  const target = new Float32Array(n);
  for (let i = 0; i < n; i++) target[i] = 0.55;
  for (const [a, b] of lift) for (let i = Math.max(0, Math.round(a * RATE)); i < Math.min(n, Math.round(b * RATE)); i++) target[i] = 0.85;
  for (const e of events) {
    if (e.kind === 'click' || e.kind === 'pop') continue;
    for (let i = Math.max(0, Math.round((e.t - 0.05) * RATE)); i < Math.min(n, Math.round((e.t + 0.6) * RATE)); i++) target[i] *= 0.7;
  }
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  let g = target[0];
  const smooth = 1 / (0.25 * RATE);
  for (let i = 0; i < n; i++) {
    g += (target[i] - g) * smooth;
    const t = i / RATE;
    const fade = Math.min(1, t / 1.0) * Math.min(1, (duration - t) / 3.0);
    left[i] = m.l[i] * g * fade + fx.l[i];
    right[i] = m.r[i] * g * fade + fx.r[i];
  }
  // Gentle soft-clip limiter, then normalise to −1 dBFS.
  let peak = 0;
  for (let i = 0; i < n; i++) {
    left[i] = Math.tanh(left[i] * 1.2) / 1.2;
    right[i] = Math.tanh(right[i] * 1.2) / 1.2;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const norm = peak > 0 ? 0.891 / peak : 1;
  for (let i = 0; i < n; i++) {
    left[i] *= norm;
    right[i] *= norm;
  }
  return { left, right };
}

export async function writeWav(file, { left, right }) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
  }
  await writeFile(file, buf);
}
