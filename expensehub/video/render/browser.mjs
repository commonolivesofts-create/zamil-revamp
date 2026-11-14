// Shared helpers: serve video/ over local HTTP and open the player in headless Chromium.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const VIDEO_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

export function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(join(VIDEO_DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(VIDEO_DIR)) return res.writeHead(403).end();
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

/** Opens player.html and waits for fonts + runtime; returns {browser, page, timeline, total, close}. */
export async function openPlayer() {
  const { server, url } = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}/player.html?t=0`);
  await page.waitForFunction(() => typeof window.renderAt === 'function', null, { timeout: 20000 });
  await page.evaluate(() => window.ready);
  if (errors.length) throw new Error(`Player errors:\n${errors.join('\n')}`);
  const timeline = await page.evaluate(() => window.TIMELINE);
  const total = await page.evaluate(() => window.TOTAL);
  const shot = async (T, file) => {
    await page.evaluate((x) => window.renderAt(x), T);
    const jpg = Boolean(file?.endsWith('.jpg'));
    return page.screenshot({ path: file ?? undefined, type: jpg ? 'jpeg' : 'png', ...(jpg ? { quality: 88 } : {}) });
  };
  /** Global time for a scene id at local content time t. */
  const at = (id, t) => {
    const s = timeline.find((x) => x.id === id);
    if (!s) throw new Error(`No scene ${id}`);
    return s.start + s.contentOffset + t;
  };
  const close = async () => {
    await browser.close();
    server.close();
  };
  return { browser, page, timeline, total, shot, at, close, errors };
}
