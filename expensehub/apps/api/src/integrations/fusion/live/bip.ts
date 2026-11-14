// Implements: INTEGRATION §3 — BIP runReport over SOAP (ExternalReportWSSService), CSV output.
// Read-only. Basic auth from .env; the password never reaches a log or an error message.
import { parse } from 'csv-parse/sync';
import { FusionError, type FusionResponse } from '../client';

export interface BipConnection {
  baseUrl: string;
  user: string;
  password: string;
  /** Catalog folder, e.g. /Custom/ExpenseHub. */
  pathPrefix: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const NS = 'http://xmlns.oracle.com/oxp/service/PublicReportService';

const xml = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', "'": 'apos', '"': 'quot' }[c]};`,
  );

/** SOAP 1.2 runReport request. Empty parameters are left out (the data model's default applies). */
export function runReportEnvelope(reportPath: string, params: Record<string, string>): string {
  const items = Object.entries(params)
    .filter(([, v]) => v !== '')
    .map(
      ([name, value]) =>
        `<pub:item><pub:name>${xml(name)}</pub:name><pub:values><pub:item>${xml(value)}</pub:item></pub:values></pub:item>`,
    )
    .join('');
  return (
    `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:pub="${NS}">` +
    `<soap:Header/><soap:Body><pub:runReport><pub:reportRequest>` +
    // Data XML needs no layout in the report (a layout-less report refuses "csv").
    `<pub:attributeFormat>xml</pub:attributeFormat>` +
    `<pub:flattenXML>false</pub:flattenXML>` +
    `<pub:parameterNameValues>${items}</pub:parameterNameValues>` +
    `<pub:reportAbsolutePath>${xml(reportPath)}</pub:reportAbsolutePath>` +
    `<pub:sizeOfDataChunkDownload>-1</pub:sizeOfDataChunkDownload>` +
    `</pub:reportRequest><pub:appParams></pub:appParams></pub:runReport></soap:Body></soap:Envelope>`
  );
}

const tag = (body: string, name: string) =>
  new RegExp(`<(?:[\\w-]+:)?${name}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`).exec(body)?.[1];

/** The fault text of a SOAP 1.1/1.2 fault, without markup. */
export function soapFault(body: string): string | null {
  const text = tag(body, 'Text') ?? tag(body, 'faultstring');
  if (text === undefined) return null;
  return text
    .replace(/<[^>]+>/g, '')
    .trim()
    .slice(0, 500);
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', apos: "'", quot: '"' };
const unescapeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(lt|gt|amp|apos|quot|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
      e[0] === '#'
        ? String.fromCodePoint(
            e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
          )
        : ENTITIES[e.toLowerCase()]!,
    );

/**
 * BIP data XML (DATA_DS / G_1 rows of flat elements — see scripts/bip-deploy.mjs) → rows keyed
 * by element name. Empty elements (<X/>) become ''.
 */
export function parseDataXml(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  // A row = an element whose children are all plain fields (BIP nests rows in list wrappers,
  // e.g. DATA_DS > LIST_G_1 > G_1, depending on the data model).
  const ROW =
    /<([A-Za-z_][\w.-]*)>((?:\s*(?:<[A-Za-z_][\w.-]*\s*\/>|<([A-Za-z_][\w.-]*)>(?:[^<]|<!\[CDATA\[[\s\S]*?\]\]>)*<\/\3>))+\s*)<\/\1>/g;
  // An empty result is the root holding only parameters / <ROWSET/>: never a row itself.
  const rootName = /<([A-Za-z_][\w.-]*)/.exec(text.replace(/<\?xml[^>]*\?>/, ''))?.[1];
  for (const [, name, inner] of text.matchAll(ROW)) {
    if (name === rootName) continue;
    const row: Record<string, string> = {};
    for (const m of inner!.matchAll(
      /<([A-Za-z_][\w.-]*)\s*\/>|<([A-Za-z_][\w.-]*)>([\s\S]*?)<\/\2>/g,
    )) {
      if (m[1]) row[m[1]] = '';
      else row[m[2]!] = unescapeXml(m[3]!).trim();
    }
    rows.push(row);
  }
  return rows;
}

/** reportBytes (base64 data XML, or CSV from a report with a CSV layout) → rows. */
export function parseRunReportResponse(body: string): Record<string, string>[] {
  const bytes = tag(body, 'reportBytes');
  if (bytes === undefined) throw new FusionError('BIP response has no reportBytes.', 200, false);
  const text = Buffer.from(bytes.replace(/\s+/g, ''), 'base64')
    .toString('utf8')
    .replace(/^\uFEFF/, '');
  if (text.trim() === '') return [];
  if (text.trimStart().startsWith('<')) return parseDataXml(text);
  return parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true });
}

export async function runBipReport(
  conn: BipConnection,
  report: string,
  params: Record<string, string>,
): Promise<FusionResponse<Record<string, string>[]>> {
  const doFetch = conn.fetch ?? fetch;
  const url = `${conn.baseUrl.replace(/\/+$/, '')}/xmlpserver/services/ExternalReportWSSService`;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        Authorization: `Basic ${Buffer.from(`${conn.user}:${conn.password}`).toString('base64')}`,
      },
      body: runReportEnvelope(`${conn.pathPrefix}/${report}.xdo`, params),
      signal: AbortSignal.timeout(conn.timeoutMs ?? 120_000),
    });
  } catch (err) {
    // Network error or timeout: retryable (INTEGRATION §2.4).
    throw new FusionError(`BIP ${report}: ${(err as Error).message}`, null, true);
  }
  const body = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new FusionError(
      `BIP ${report}: HTTP ${res.status} — check the integration user and its BI roles.`,
      res.status,
      false,
    );
  }
  const fault = soapFault(body);
  if (fault !== null || !res.ok) {
    // A SOAP fault (report missing, bad SQL, no access) will not fix itself; only 5xx without a
    // fault (gateway / pod down) and 429 are worth retrying.
    const retryable = fault === null && (res.status === 429 || res.status >= 500);
    throw new FusionError(`BIP ${report}: ${fault ?? `HTTP ${res.status}`}`, res.status, retryable);
  }
  const rows = parseRunReportResponse(body);
  // With no rows there is no personal data: keep the start of the document for diagnosis.
  const raw =
    rows.length > 0
      ? `${rows.length} rows`
      : `0 rows: ${Buffer.from(tag(body, 'reportBytes')?.replace(/\s+/g, '') ?? '', 'base64')
          .toString('utf8')
          .slice(0, 300)}`;
  return { body: rows, httpStatus: res.status, raw };
}
