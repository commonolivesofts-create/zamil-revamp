// Renders ExpenseHub_Demo_Full.mp4 and ExpenseHub_Demo_Highlight.mp4 into video/out/.
//   node video/render/render.mjs            full render (frames → H.264, music + SFX → AAC, highlight cut)
//   node video/render/render.mjs --reuse    skip frame rendering, reuse out/work/video.mp4
//   node video/render/render.mjs --test 4   render only the first 4 seconds (timing check)
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { VIDEO_DIR, openPlayer } from './browser.mjs';
import { mix, writeWav } from './audio.mjs';

const FPS = 30;
const WORKERS = 6;
const OUT = join(VIDEO_DIR, 'out');
const WORK = join(OUT, 'work');
const args = process.argv.slice(2);
const reuse = args.includes('--reuse');
const testSecs = args.includes('--test') ? Number(args[args.indexOf('--test') + 1] ?? 4) : null;

// Highlight cut: [scene id, local start, local end] (content time, after the title card).
const HIGHLIGHT = [
  ['intro', 0.6, 3.6],
  ['capture', 8.0, 13.0],
  ['policy', 2.6, 7.9],
  ['report', 7.2, 10.8],
  ['approval', 9.4, 14.9],
  ['audit', 9.0, 13.0],
  ['payables', 7.0, 12.8],
  ['paid', 2.4, 7.0],
  ['closing', 5.0, 10.95],
];
const XFADE = 0.35;
// Web-standard loudness with headroom so AAC never clips.
const LOUDNORM = 'loudnorm=I=-16:TP=-1.5:LRA=11';

const log = (s) => process.stdout.write(`${s}\n`);

function ffmpeg(argv, { stdin = false } = {}) {
  const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: [stdin ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}: ${argv.join(' ')}`)))));
  return { p, done };
}

async function renderFrames(player, total) {
  const frames = testSecs ? Math.round(testSecs * FPS) : Math.round(total * FPS);
  const per = Math.ceil(frames / WORKERS);
  const pages = [player.page];
  for (let i = 1; i < WORKERS; i++) {
    const pg = await player.browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await pg.goto(player.page.url());
    await pg.waitForFunction(() => typeof window.renderAt === 'function');
    await pg.evaluate(() => window.ready);
    pages.push(pg);
  }
  let doneFrames = 0;
  const started = Date.now();
  const progress = setInterval(() => {
    const rate = doneFrames / ((Date.now() - started) / 1000);
    log(`  frames ${doneFrames}/${frames} · ${rate.toFixed(1)} fps · ~${Math.round((frames - doneFrames) / Math.max(rate, 0.1))} s left`);
  }, 15000);
  const segs = [];
  await Promise.all(
    pages.map(async (pg, w) => {
      const a = w * per;
      const b = Math.min(frames, a + per);
      if (a >= b) return;
      const file = join(WORK, `seg-${w}.mp4`);
      segs[w] = file;
      const enc = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), file], { stdin: true });
      for (let f = a; f < b; f++) {
        await pg.evaluate((T) => window.renderAt(T), f / FPS);
        const jpg = await pg.screenshot({ type: 'jpeg', quality: 93 });
        if (!enc.p.stdin.write(jpg)) await new Promise((ok) => enc.p.stdin.once('drain', ok));
        doneFrames++;
      }
      enc.p.stdin.end();
      await enc.done;
    }),
  );
  clearInterval(progress);
  log(`  ${frames} frames in ${Math.round((Date.now() - started) / 1000)} s`);
  // Cursor clicks are recorded by every page as it renders; merge them.
  const clicks = new Set();
  for (const pg of pages) for (const c of await pg.evaluate(() => [...window.__clicks])) clicks.add(c);
  const list = join(WORK, 'segments.txt');
  await writeFile(list, segs.filter(Boolean).map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', join(WORK, 'video.mp4')]).done;
  await writeFile(join(WORK, 'clicks.json'), JSON.stringify([...clicks].sort((x, y) => x - y)));
  return [...clicks];
}

function cues(timeline, clicks) {
  const events = [];
  for (const s of timeline) {
    if (s.start > 0) events.push({ t: s.start, kind: 'whoosh' });
    for (const [t, kind] of s.sfx) events.push({ t, kind });
  }
  for (const t of clicks) events.push({ t, kind: 'click' });
  return events.sort((a, b) => a.t - b.t);
}

await mkdir(WORK, { recursive: true });
const player = await openPlayer();
const { timeline, total } = player;
let clicks;
try {
  if (reuse && existsSync(join(WORK, 'video.mp4'))) {
    log('Reusing rendered frames');
    // Collect click times by sweeping the timeline once (cheap; no screenshots).
    clicks = await player.page.evaluate((tot) => {
      for (let T = 0; T < tot; T += 0.5) window.renderAt(T);
      return [...window.__clicks];
    }, total);
  } else {
    log(`Rendering frames (${WORKERS} workers)…`);
    clicks = await renderFrames(player, total);
  }
} finally {
  await player.close();
}
if (testSecs) {
  log(`Test render done: ${join(WORK, 'video.mp4')}`);
  process.exit(0);
}

// ── Full video: audio + mux ──
const duration = Math.round(total * FPS) / FPS;
const events = cues(timeline, clicks);
const lift = [[0, 10.4], [total - 11, total]];
for (const s of timeline) if (s.contentOffset > 0) lift.push([s.start, s.start + s.contentOffset]);
log(`Mixing audio: ${events.length} cues (${clicks.length} clicks)`);
await writeWav(join(WORK, 'full.wav'), mix({ duration, events, lift }));
const FULL = join(OUT, 'ExpenseHub_Demo_Full.mp4');
await ffmpeg(['-i', join(WORK, 'video.mp4'), '-i', join(WORK, 'full.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', LOUDNORM, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', FULL]).done;
log(`✓ ${FULL}`);

// ── Highlight cut: trimmed windows joined with crossfades, own music bed ──
const at = (id, t) => {
  const s = timeline.find((x) => x.id === id);
  return s.start + s.contentOffset + t;
};
const parts = HIGHLIGHT.map(([id, a, b]) => ({ a: at(id, a), b: at(id, b) }));
let filter = parts.map((p, i) => `[0:v]trim=${p.a.toFixed(3)}:${p.b.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`).join(';');
let acc = 'v0';
let outLen = parts[0].b - parts[0].a;
const outStart = [0];
for (let i = 1; i < parts.length; i++) {
  const off = outLen - XFADE;
  outStart.push(off);
  filter += `;[${acc}][v${i}]xfade=transition=fade:duration=${XFADE}:offset=${off.toFixed(3)}[x${i}]`;
  acc = `x${i}`;
  outLen = off + (parts[i].b - parts[i].a);
}
const hEvents = [];
parts.forEach((p, i) => {
  if (i > 0) hEvents.push({ t: outStart[i] + XFADE / 2, kind: 'whoosh' });
  for (const e of events) if (e.kind !== 'whoosh' && e.t >= p.a + 0.05 && e.t < p.b - 0.1) hEvents.push({ t: outStart[i] + (e.t - p.a), kind: e.kind });
});
hEvents.push({ t: 0.2, kind: 'swell' });
await writeWav(join(WORK, 'highlight.wav'), mix({ duration: outLen, events: hEvents, lift: [[0, 3.2], [outLen - 6, outLen]] }));
const HL = join(OUT, 'ExpenseHub_Demo_Highlight.mp4');
await ffmpeg(['-i', join(WORK, 'video.mp4'), '-i', join(WORK, 'highlight.wav'), '-filter_complex', filter, '-map', `[${acc}]`, '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-af', LOUDNORM, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', HL]).done;
log(`✓ ${HL} (${outLen.toFixed(1)} s)`);
