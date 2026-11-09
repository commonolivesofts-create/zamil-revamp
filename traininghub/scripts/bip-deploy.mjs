// npm run fusion:bip-deploy [REPORT ...]
// Creates /Custom/TrainingHub in the Fusion pod and uploads one data model + one report per
// fusion/bip/*.sql, using the BI author account FUSION_BI_USER / FUSION_BI_PASSWORD from .env.
// Writes ONLY inside /Custom/TrainingHub. Never prints credentials. Re-running overwrites.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import archiver from 'archiver';

const root = path.resolve(import.meta.dirname, '..');
process.loadEnvFile(path.join(root, '.env'));
const { FUSION_BASE_URL: base, FUSION_BI_USER: user, FUSION_BI_PASSWORD: pass } = process.env;
const FOLDER = process.env.TH_BIP_FOLDER || '/Custom/TrainingHub';
const say = (line) => process.stdout.write(`${line}\n`);

/** Data source per report (INTEGRATION §4). */
const SOURCE = {
  TH_HCM_EMPLOYEES: 'ApplicationDB_HCM',
};

if (!base || !user || !pass) {
  process.stderr.write(
    '[bip-deploy] FUSION_BASE_URL, FUSION_BI_USER and FUSION_BI_PASSWORD must be set in .env\n',
  );
  process.exit(1);
}
if (!FOLDER.startsWith('/Custom/')) {
  process.stderr.write(`[bip-deploy] refusing to write outside /Custom: ${FOLDER}\n`);
  process.exit(1);
}

const esc = (s) =>
  String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
const faultOf = (b) => /<faultstring>([\s\S]*?)<\/faultstring>/.exec(b)?.[1]?.slice(0, 400);

async function catalog(op, inner) {
  const body =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v2="http://xmlns.oracle.com/oxp/service/v2">` +
    `<soapenv:Header/><soapenv:Body><v2:${op}>${inner}<v2:userID>${esc(user)}</v2:userID>` +
    `<v2:password>${esc(pass)}</v2:password></v2:${op}></soapenv:Body></soapenv:Envelope>`;
  const r = await fetch(`${base.replace(/\/+$/, '')}/xmlpserver/services/v2/CatalogService`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body,
  });
  return { status: r.status, body: await r.text() };
}

function zip(files) {
  return new Promise((resolve, reject) => {
    const a = archiver('zip');
    const out = new PassThrough();
    const chunks = [];
    out.on('data', (c) => chunks.push(c));
    out.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    a.on('error', reject);
    a.pipe(out);
    for (const [name, content] of Object.entries(files)) a.append(content, { name });
    a.finalize();
  });
}

/**
 * Data model (.xdm) and report (.xdo) for one SQL file. Output columns = the UPPER-CASE aliases.
 * `dmPath` is versioned per deploy: Fusion's BI servers cache data models by path, so a new
 * path takes effect at once on every server.
 */
export function build(name, sqlText, dmPath = `${FOLDER}/${name}_DM`) {
  const sql = sqlText
    .replace(/\r\n/g, '\n')
    .replace(/^--.*\n/gm, '')
    .trim();
  const columns = [...new Set([...sql.matchAll(/\bAS\s+([A-Z][A-Z0-9_]*)\b/g)].map((m) => m[1]))];
  const params = [...new Set([...sql.matchAll(/:(P_[A-Z_]+)/g)].map((m) => m[1]))];
  const ds = SOURCE[name] ?? 'ApplicationDB_FSCM';
  const elements = columns
    .map(
      (c, i) =>
        `<element name="${c}" value="${c}" label="${c}" dataType="xsd:string" breakOrder="" fieldOrder="${i + 1}"/>`,
    )
    .join('\n');
  const xdm = `<?xml version = '1.0' encoding = 'utf-8'?>
<dataModel xmlns="http://xmlns.oracle.com/oxp/xmlp" version="2.0" xmlns:xdm="http://xmlns.oracle.com/oxp/xmlp" xmlns:xsd="http://wwww.w3.org/2001/XMLSchema" defaultDataSourceRef="${ds}">
<description><![CDATA[TrainingHub ${name} - generated from fusion/bip/${name}.sql]]></description>
<dataProperties>
<property name="include_parameters" value="false"/>
<property name="include_null_Element" value="true"/>
<property name="include_rowsettag" value="false"/>
<property name="xml_tag_case" value="upper"/>
<property name="generate_output_format" value="xml"/>
<property name="optimize_query_executions" value="false"/>
</dataProperties>
<dataSets>
<dataSet name="TH" type="simple">
<sql dataSourceRef="${ds}"><![CDATA[${sql}]]></sql>
</dataSet>
</dataSets>
<output rootName="DATA_DS" uniqueRowName="false">
<nodeList name="data-structure">
<dataStructure tagName="DATA_DS">
<group name="G_1" label="G_1" source="TH">
${elements}
</group>
</dataStructure>
</nodeList>
</output>
<eventTriggers/>
<lexicals/>
<valueSets/>
<parameters>
${params.map((p, i) => `<parameter name="${p}" dataType="xsd:string" rowPlacement="${i + 1}"><input label="${p}"/></parameter>`).join('\n')}
</parameters>
<bursting/>
<display><layouts><layout name="TH" left="0px" top="0px"/><layout name="DATA_DS" left="0px" top="0px"/></layouts><groupLinks/></display>
</dataModel>`;
  const xdo = `<?xml version = '1.0' encoding = 'utf-8'?>
<report xmlns="http://xmlns.oracle.com/oxp/xmlp" xmlns:xsd="http://wwww.w3.org/2001/XMLSchema" version="2.0" dataModel="true" useBIPParameters="true" producerName="TrainingHub" cachePerUser="true" cacheSmartRefresh="false" cacheUserRefresh="false">
<dataModel url="${dmPath}.xdm"/>
<description><![CDATA[TrainingHub ${name}. Data for the TrainingHub employee sync - do not rename.]]></description>
<property name="showControls" value="true"/>
<property name="showReportLinks" value="true"/>
<property name="cacheDocument" value="false"/>
<property name="online" value="true"/>
<property name="openLinkInNewWindow" value="true"/>
<property name="autoRun" value="false"/>
<property name="controledByExtApp" value="false"/>
<property name="enableBursting" value="false"/>
<parameters paramPerLine="3" style="1">
${params.map((p) => `<parameter id="${p}" defaultValue="" fieldWidth="20" dataType="xsd:string" multiValuesAllowed="false" refreshParamOnChange="false" selectAll="false" templateParam="false" useNullForAll="false"/>`).join('\n')}
</parameters>
<templates default=""/>
</report>`;
  return { xdm, xdo, columns, params };
}

async function upload(objectPath, type, base64) {
  // uploadObject never overwrites: remove our previous copy first (always inside FOLDER).
  if (!objectPath.startsWith(`${FOLDER}/`)) throw new Error(`refusing to touch ${objectPath}`);
  await catalog(
    'deleteObject',
    `<v2:objectAbsolutePath>${esc(`${objectPath}.${type === 'xdmz' ? 'xdm' : 'xdo'}`)}</v2:objectAbsolutePath>`,
  );
  const r = await catalog(
    'uploadObject',
    `<v2:reportObjectAbsolutePathURL>${esc(objectPath)}</v2:reportObjectAbsolutePathURL>` +
      `<v2:objectType>${type}</v2:objectType><v2:objectZippedData>${base64}</v2:objectZippedData>`,
  );
  return r.status === 200 ? 'OK' : `FAILED — HTTP ${r.status} ${faultOf(r.body) ?? ''}`;
}

async function listFolder() {
  const r = await catalog(
    'getFolderContents',
    `<v2:folderAbsolutePath>${esc(FOLDER)}</v2:folderAbsolutePath>`,
  );
  return [...r.body.matchAll(/<(?:\w+:)?absolutePath>([^<]*)<\/(?:\w+:)?absolutePath>/g)]
    .map((m) => m[1])
    .filter((p) => p.startsWith(`${FOLDER}/`));
}

/** e.g. V20261023141530 — makes each deploy's data model path new. */
const version = `V${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;

const dir = path.join(root, 'fusion', 'bip');
const all = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.replace(/\.sql$/, ''));
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const reports = wanted.length ? wanted : all;

const folder = await catalog(
  'createFolder',
  `<v2:folderAbsolutePath>${esc(FOLDER)}</v2:folderAbsolutePath>`,
);
say(
  `[bip-deploy] folder ${FOLDER}: ${folder.status === 200 ? 'created' : /Duplicate/.test(folder.body) ? 'exists' : faultOf(folder.body)}`,
);
let failed = 0;
for (const name of reports) {
  if (!all.includes(name)) {
    say(`[bip-deploy] ${name}: no fusion/bip/${name}.sql`);
    failed++;
    continue;
  }
  const dmPath = `${FOLDER}/${name}_DM_${version}`;
  const { xdm, xdo, columns, params } = build(
    name,
    readFileSync(path.join(dir, `${name}.sql`), 'utf8'),
    dmPath,
  );
  const dm = await upload(dmPath, 'xdmz', await zip({ '_datamodel.xdm': xdm }));
  const rep = await upload(`${FOLDER}/${name}`, 'xdoz', await zip({ '_report.xdo': xdo }));
  if (dm !== 'OK' || rep !== 'OK') failed++;
  else {
    // Remove this report's older data models (only ours, only inside FOLDER).
    for (const old of await listFolder()) {
      const base = old.slice(FOLDER.length + 1);
      if (old !== `${dmPath}.xdm` && base.startsWith(`${name}_DM`) && base.endsWith('.xdm')) {
        await catalog('deleteObject', `<v2:objectAbsolutePath>${esc(old)}</v2:objectAbsolutePath>`);
      }
    }
  }
  say(`[bip-deploy] ${name}: ${columns.length} columns, params ${params.join(', ') || 'none'}`);
  say(`             data model ${dm} · report ${rep}`);
}
say(
  failed
    ? `[bip-deploy] ${failed} failed`
    : '[bip-deploy] done — now run: npm run fusion:sync',
);
process.exitCode = failed ? 1 : 0;
