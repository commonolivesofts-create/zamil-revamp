// Report table (markup of client InsightReport table: zrv-ir-table + zrv-report-table).
import type { CSSProperties } from 'react';
import type { Column } from './types';

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  firstRowNumber,
  busy,
}: {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T, index: number) => string;
  firstRowNumber: number;
  busy: boolean;
}) {
  return (
    <div
      className="zrv-ir-tablewrap"
      // A horizontally scrollable region must be reachable by keyboard (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      role="region"
      aria-label={caption}
      aria-busy={busy || undefined}
    >
      <table
        className={`zrv-ir-table zrv-report-table${columns.length > 8 ? ' zrv-ir-table--wide' : ''}`}
      >
        <caption className="zrv-hr-sr">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="zat-col-num">
              #
            </th>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} style={{ '--i': index } as CSSProperties}>
              <td className="zat-col-num" data-label="#">
                {firstRowNumber + index}
              </td>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`zrv-ir-col-${column.key}`}
                  data-label={column.label}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
