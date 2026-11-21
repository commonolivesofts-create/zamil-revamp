// Contractor Summary (CI3 /report/contractor-summary): hours and cost per contractor employee for a
// date range, with the daily report and the per-contractor rollup. Needs the Zamil VPN or office network.
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  CONTRACTOR_DIVISIONS,
  contractorSummaryOptionsSchema,
  contractorSummaryResultSchema,
  toIsoDate,
  type ContractorSummaryFilters,
  type ContractorSummaryResult,
} from '@attendance/shared';
import { ContentSkeleton } from '../../components/Feedback';
import { OrvexaIcon } from '../../components/OrvexaIcon';
import { useToast } from '../../components/toastContext';
import { api, apiDownload, errorMessage } from '../../lib/api';
import { saveBlob } from '../../lib/download';

/** CI3 formatNumber: toFixed(2), 0.00 for anything that is not a number. */
const fixed = (value: string | number | null) => {
  const n = parseFloat(String(value ?? ''));
  return Number.isNaN(n) ? (0).toFixed(2) : n.toFixed(2);
};

type Cell = string | number | null;
interface Table {
  title: string;
  file: string;
  head: string[];
  rows: { cells: Cell[]; kind?: 'subtotal' }[];
  foot?: Cell[];
  empty: string;
}

/** The three CI3 tabs, as tables (also used for Excel and Print). */
function buildTables(data: ContractorSummaryResult): Table[] {
  // Summary: rows grouped by contractor + division with a subtotal after each group.
  const summary: Table['rows'] = [];
  let group: string | null = null;
  let sub = { hrs: 0, cost: 0, emp: 0 };
  let grand = { hrs: 0, cost: 0 };
  let index = 0;
  const flush = () => {
    if (group === null) return;
    summary.push({
      kind: 'subtotal',
      cells: [
        '',
        '',
        '',
        '',
        'Employees:',
        sub.emp,
        '',
        'Subtotal',
        '',
        fixed(sub.hrs),
        fixed(sub.cost),
      ],
    });
  };
  for (const r of data.summary) {
    const key = `${r.conNo}|${r.division}`;
    if (key !== group) {
      flush();
      group = key;
      sub = { hrs: 0, cost: 0, emp: 0 };
    }
    const hrs = parseFloat(r.totHrs ?? '') || 0;
    const cost = parseFloat(r.totCost ?? '') || 0;
    sub = { hrs: sub.hrs + hrs, cost: sub.cost + cost, emp: sub.emp + 1 };
    grand = { hrs: grand.hrs + hrs, cost: grand.cost + cost };
    index++;
    summary.push({
      cells: [
        index,
        r.conNo,
        r.conName,
        r.division,
        r.dep,
        r.employeeNumber,
        r.employeeName,
        r.iqamah,
        r.rate,
        fixed(hrs),
        fixed(cost),
      ],
    });
  }
  flush();

  // CI3 renderReportTab / renderGroupwiseTab footer totals.
  const reportHrs = data.records.reduce((sum, r) => sum + (parseFloat(r.actHrs ?? '') || 0), 0);
  const groupEmp = data.stats.reduce((sum, r) => sum + (parseInt(r.totalEmp ?? '', 10) || 0), 0);
  const groupCost = data.stats.reduce((sum, r) => sum + (parseFloat(r.totalCost ?? '') || 0), 0);

  return [
    {
      title: 'Summary',
      file: 'Contractor_Summary',
      head: [
        '#',
        'Con No',
        'Contractor Name',
        'Div',
        'Department',
        'Emp No',
        'Emp Name',
        'Iqamah',
        'Rate',
        'Tot Hrs',
        'Tot Cost',
      ],
      rows: summary,
      foot: ['', '', '', '', '', '', '', '', 'Total', fixed(grand.hrs), fixed(grand.cost)],
      empty: 'No summary data for the selected filters.',
    },
    {
      title: 'Report',
      file: 'Contractor_Report',
      head: [
        '#',
        'Date',
        'Con #',
        'Con Name',
        'Dep ID',
        'Dept',
        'Emp #',
        'Emp Name',
        'Punch In',
        'Punch Out',
        'Act Hrs',
      ],
      rows: data.records.map((r, i) => ({
        cells: [
          i + 1,
          r.tDate,
          r.conNo,
          r.conName,
          r.depId,
          r.dep,
          r.empNo,
          r.employeeName,
          r.innPIn,
          r.outtPOut,
          fixed(r.actHrs),
        ],
      })),
      foot: ['', '', '', '', '', '', '', '', '', 'Total', fixed(reportHrs)],
      empty: 'No punch detail for the selected filters.',
    },
    {
      title: 'Summary Group Wise',
      file: 'Contractor_Group_Summary',
      head: ['#', 'Con No', 'Contractor Name', 'Total Employees', 'Total Cost'],
      rows: data.stats.map((r, i) => ({
        cells: [i + 1, r.conNo, r.conName, parseInt(r.totalEmp ?? '', 10) || 0, fixed(r.totalCost)],
      })),
      foot: ['', '', 'Total', groupEmp, fixed(groupCost)],
      empty: 'No contractor rollup for the selected filters.',
    },
  ];
}

const text = (cell: Cell) => (cell === null || cell === undefined ? '' : String(cell));

/** CI3 used SheetJS table_to_book; exceljs is loaded only when this is clicked. */
async function exportExcel(table: Table) {
  const { Workbook } = (await import('exceljs')).default;
  const book = new Workbook();
  const sheet = book.addWorksheet('sheet-1');
  sheet.addRow(table.head);
  for (const row of table.rows) sheet.addRow(row.cells.map(text));
  if (table.foot) sheet.addRow(table.foot.map(text));
  const buffer = await book.xlsx.writeBuffer();
  saveBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${table.file}.xlsx`,
  );
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]!,
  );

/** CI3 printSummaryTable: the table alone in a print window. */
function printTable(table: Table) {
  const row = (cells: Cell[], tag: 'td' | 'th') =>
    `<tr>${cells.map((c) => `<${tag}>${escapeHtml(text(c))}</${tag}>`).join('')}</tr>`;
  const html = `<html><head><title>Print</title><style>
    table { border-collapse: collapse; width: 100%; font-family: sans-serif; font-size: 12px; }
    th, td { border: 1px solid #999; padding: 4px 6px; } th { background: #eaf7ef; }
  </style></head><body><table><thead>${row(table.head, 'th')}</thead><tbody>${table.rows
    .map((r) => row(r.cells, 'td'))
    .join(
      '',
    )}</tbody>${table.foot ? `<tfoot>${row(table.foot, 'th')}</tfoot>` : ''}</table></body></html>`;
  const win = window.open('', '', 'width=1366,height=768');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

const monthDefaults = (): ContractorSummaryFilters => {
  const now = new Date();
  return {
    div: '',
    cont: '',
    dept: '',
    from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

export default function ContractorSummaryPage() {
  const id = useId().replace(/:/g, '');
  const toast = useToast();
  const [filters, setFilters] = useState<ContractorSummaryFilters>(monthDefaults);
  const [tab, setTab] = useState(0);
  const options = useQuery({
    queryKey: ['contractor-summary-options'],
    queryFn: ({ signal }) =>
      api('/contractor-summary/options', contractorSummaryOptionsSchema, { signal }),
    staleTime: 5 * 60_000,
  });
  const run = useMutation({
    mutationFn: (f: ContractorSummaryFilters) =>
      api('/contractor-summary/run', contractorSummaryResultSchema, {
        method: 'POST',
        body: { filters: f },
      }),
  });
  // CI3 ran the report once on load with the default month.
  const ran = useRef(false);
  const { mutate } = run;
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    mutate(monthDefaults());
  }, [mutate]);

  const set = (key: keyof ContractorSummaryFilters) => (event: { target: { value: string } }) =>
    setFilters((f) => ({ ...f, [key]: event.target.value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    run.mutate(filters);
  };
  const exportCsv = async () => {
    try {
      const { blob, fileName } = await apiDownload('/contractor-summary/export', { filters });
      saveBlob(blob, fileName);
      toast.success('Export downloaded.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const tables = run.data ? buildTables(run.data) : null;
  const table = tables?.[tab];

  return (
    <div className="zrv-hr zrv-hr--contractor-summary zrv-hr--compact zrv-ir zrv-ir--fitted zrv-ir--responsive zat-report">
      <header className="zrv-ir-head">
        <div className="zrv-ir-head__title">
          <nav aria-label="Breadcrumb">
            <ol className="zrv-ir-crumb">
              <li>Attendance</li>
              <li>Contractors</li>
              <li>Contractor Summary</li>
            </ol>
          </nav>
          <h1 className="zrv-hr-title">Contractor Summary</h1>
          <p className="zrv-hr-sub">
            Hours and cost per contractor employee for the selected dates.
          </p>
        </div>
      </header>

      <form className="zrv-ir-filters zat-summary-filters" onSubmit={submit} aria-label="Filters">
        <label className="zrv-ir-field" htmlFor={`${id}-div`}>
          <span>Division</span>
          <select id={`${id}-div`} value={filters.div} onChange={set('div')}>
            <option value="">Select</option>
            {CONTRACTOR_DIVISIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
            <option value="ALL">ALL</option>
          </select>
        </label>
        <label className="zrv-ir-field" htmlFor={`${id}-cont`}>
          <span>Contractor Name</span>
          <input
            id={`${id}-cont`}
            list={`${id}-cont-list`}
            placeholder="Any contractor"
            value={filters.cont}
            onChange={set('cont')}
          />
          <datalist id={`${id}-cont-list`}>
            {(options.data?.contractors ?? []).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label className="zrv-ir-field" htmlFor={`${id}-dept`}>
          <span>Department</span>
          <input
            id={`${id}-dept`}
            list={`${id}-dept-list`}
            placeholder="Any department"
            value={filters.dept}
            onChange={set('dept')}
          />
          <datalist id={`${id}-dept-list`}>
            {(options.data?.departments ?? []).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label className="zrv-ir-field" htmlFor={`${id}-from`}>
          <span>From Date</span>
          <input id={`${id}-from`} type="date" value={filters.from} onChange={set('from')} />
        </label>
        <label className="zrv-ir-field" htmlFor={`${id}-to`}>
          <span>To Date</span>
          <input id={`${id}-to`} type="date" value={filters.to} onChange={set('to')} />
        </label>
        <div className="zrv-ir-filters__actions">
          <button type="submit" className="zrv-ir-btn zrv-ir-btn--primary" disabled={run.isPending}>
            <OrvexaIcon name="play" size={16} />
            {run.isPending ? 'Running…' : 'Run'}
          </button>
        </div>
      </form>

      <section className="zrv-ir-card zrv-ir-stream">
        <div className="zat-tabs" role="tablist" aria-label="Contractor summary views">
          {['Summary', 'Report', 'Summary Group Wise'].map((label, i) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={tab === i}
              className={`zat-tab${tab === i ? ' is-active' : ''}`}
              onClick={() => setTab(i)}
            >
              {label}
            </button>
          ))}
          {table && (
            <span className="zat-tabs__actions">
              {tab === 0 && (
                <button type="button" className="zrv-ir-btn" onClick={() => void exportCsv()}>
                  <OrvexaIcon name="download" size={16} />
                  Export CSV
                </button>
              )}
              <button type="button" className="zrv-ir-btn" onClick={() => void exportExcel(table)}>
                <OrvexaIcon name="file-spreadsheet" size={16} />
                Export Excel
              </button>
              <button type="button" className="zrv-ir-btn" onClick={() => printTable(table)}>
                <OrvexaIcon name="printer" size={16} />
                Print
              </button>
            </span>
          )}
        </div>

        {run.isPending ? (
          <ContentSkeleton label="Running contractor summary" />
        ) : run.isError ? (
          <div className="zrv-admin-state zrv-admin-state--error" role="alert">
            <p>{errorMessage(run.error)}</p>
          </div>
        ) : table ? (
          <div className="zrv-ir-tablewrap" role="tabpanel" aria-label={table.title}>
            <table className="zrv-ir-table zrv-report-table zrv-ir-table--wide">
              <thead>
                <tr>
                  {table.head.map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.length === 0 ? (
                  <tr>
                    <td colSpan={table.head.length}>{table.empty}</td>
                  </tr>
                ) : (
                  table.rows.map((row, i) => (
                    <tr key={i} className={row.kind === 'subtotal' ? 'zat-subtotal' : undefined}>
                      {row.cells.map((cell, j) => (
                        <td key={j} data-label={table.head[j]}>
                          {text(cell)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
              {/* CI3 keeps the totals row (0.00) when a tab is empty. */}
              {table.foot && (
                <tfoot>
                  <tr className="zat-subtotal">
                    {table.foot.map((cell, j) => (
                      <th key={j} scope={j === 0 ? 'row' : undefined}>
                        {text(cell)}
                      </th>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
