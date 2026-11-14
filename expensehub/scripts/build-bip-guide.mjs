// npm run docs:bip — builds docs/BIP-SETUP.html from fusion/bip/guide.template.html and the
// fusion/bip/*.sql files (D-44), so the guide always shows the SQL that is in the project.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'fusion', 'bip');
const out = path.join(root, 'docs', 'BIP-SETUP.html');

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let missing = 0;
const html = readFileSync(path.join(dir, 'guide.template.html'), 'utf8').replace(
  /<!--SQL:([A-Z_]+)\|([^>]*)-->/g,
  (_, name, desc) => {
    let sql;
    try {
      sql = readFileSync(path.join(dir, `${name}.sql`), 'utf8')
        .replace(/\r\n/g, '\n')
        .trimEnd();
    } catch {
      missing++;
      process.stderr.write(`[docs:bip] missing fusion/bip/${name}.sql\n`);
      return '';
    }
    return (
      `<details class="sql" id="${name}"><summary><span class="sql-name">${name}</span>` +
      `<span class="sql-desc">${escape(desc)}</span></summary>` +
      `<div class="sql-body"><button class="copy" type="button">Copy SQL</button>` +
      `<pre><code>${escape(sql)}</code></pre></div></details>`
    );
  },
);

writeFileSync(out, html);
process.stdout.write(`[docs:bip] ${path.relative(root, out)} written\n`);
process.exitCode = missing ? 1 : 0;
