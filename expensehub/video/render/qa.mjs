// QA on the encoded files: stream info, loudness, and contact sheets of frames sampled from the MP4s.
//   node video/render/qa.mjs
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { VIDEO_DIR } from './browser.mjs';

const OUT = join(VIDEO_DIR, 'out');
const run = (argv) => spawnSync(ffmpegPath, ['-hide_banner', ...argv], { encoding: 'utf8' });

for (const [name, every, cols, rows] of [
  ['ExpenseHub_Demo_Full', 5, 6, 7],
  ['ExpenseHub_Demo_Highlight', 1.5, 6, 5],
]) {
  const file = join(OUT, `${name}.mp4`);
  const info = run(['-i', file]).stderr;
  process.stdout.write(`\n${name}\n${info.split('\n').filter((l) => /Duration|Stream/.test(l)).join('\n')}\n`);
  const loud = run(['-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr;
  const summary = loud.slice(loud.lastIndexOf('Summary:'));
  process.stdout.write(`${summary.split('\n').filter((l) => /I:|LRA:|Peak:/.test(l)).map((l) => l.trim()).join(' · ')}\n`);
  const sheet = join(OUT, 'qa', `${name}-sheet-%02d.jpg`);
  run(['-y', '-i', file, '-vf', `fps=1/${every},scale=480:-1,tile=${cols}x${rows}:padding=6:color=white`, '-q:v', '3', sheet]);
}
