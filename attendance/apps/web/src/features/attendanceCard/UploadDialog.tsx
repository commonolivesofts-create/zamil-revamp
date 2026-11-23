// Upload Attendance File (CI3 mdl-upload-attendance): preview a CSV/XLSX export, then import the
// valid rows into the attendance card. The same file is sent again for the import (stateless).
import { useId, useState } from 'react';
import {
  UPLOAD_MAX_BYTES,
  uploadImportSchema,
  uploadPreviewSchema,
  type UploadError,
  type UploadImport,
  type UploadPreview,
} from '@attendance/shared';
import { Badge } from '../../components/Badge';
import { Dialog } from '../../components/Dialog';
import { api, errorMessage } from '../../lib/api';
import { formatIsoDate } from '../../lib/format';
import { useSave } from '../../lib/useSave';

export function UploadDialog({ onClose }: { onClose: () => void }) {
  const id = useId().replace(/:/g, '');
  const save = useSave(['attendance-card']);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [result, setResult] = useState<UploadImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'preview' | 'import' | null>(null);

  const formData = (mode: 'preview' | 'import') => {
    const data = new FormData();
    data.append('mode', mode);
    data.append('file', file!);
    return data;
  };

  const run = async (mode: 'preview' | 'import') => {
    if (!file) {
      setError('Please select a CSV or XLSX file.');
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      setError('File size must not exceed 10 MB.');
      return;
    }
    setError(null);
    setPending(mode);
    try {
      if (mode === 'preview') {
        setResult(null);
        setPreview(
          await api('/attendance-card/upload', uploadPreviewSchema, {
            method: 'POST',
            body: formData('preview'),
          }),
        );
      } else {
        let imported: UploadImport | null = null;
        await save(async () => {
          imported = await api('/attendance-card/upload', uploadImportSchema, {
            method: 'POST',
            body: formData('import'),
          });
          return { message: imported.message };
        });
        setResult(imported);
        setPreview(null);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog
      title="Upload Attendance File"
      description="Load a biometric attendance export into the attendance card."
      onClose={onClose}
      busy={pending !== null}
      wide
    >
      <div className="zat-form">
        <p className="zat-note">
          <b>Required columns:</b> Employee ID, Date, First Punch and Last Punch (First Name is
          optional). Other columns such as Department, Weekday and Total Time are ignored. Supported
          files: CSV and XLSX, up to 10 MB.
        </p>
        <div className="field zrv-admin-field">
          <label htmlFor={`${id}-file`}>Attendance file</label>
          <input
            id={`${id}-file`}
            type="file"
            accept=".csv,.xlsx"
            className="ux-input"
            disabled={pending !== null}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setResult(null);
              setError(null);
            }}
          />
        </div>

        {error && (
          <p className="zrv-admin-feedback zrv-admin-feedback--error" role="alert">
            {error}
          </p>
        )}

        {preview && (
          <section aria-label="Preview">
            <p className="zat-badge-row" role="status">
              <Badge>Rows: {preview.summary.totalDataRows}</Badge>
              <Badge tone="good">Valid: {preview.summary.validRows}</Badge>
              <Badge tone={preview.summary.invalidRows ? 'bad' : 'neutral'}>
                Invalid: {preview.summary.invalidRows}
              </Badge>
            </p>
            {preview.rows.length > 0 && (
              <MiniTable
                caption={`Valid rows${preview.summary.validRows > preview.rows.length ? ` (first ${preview.rows.length})` : ''}`}
                head={['Row', 'Emp No', 'Name (file)', 'Date', 'Punch In', 'Punch Out']}
                rows={preview.rows.map((r) => [
                  r.row,
                  r.empNo,
                  r.empName || '—',
                  formatIsoDate(r.attDate),
                  r.punchIn,
                  r.punchOut,
                ])}
              />
            )}
            <ErrorTable errors={preview.errors} total={preview.summary.invalidRows} />
          </section>
        )}

        {result && (
          <section aria-label="Import result">
            <p className="zrv-admin-feedback zrv-admin-feedback--success" role="status">
              {result.message} Inserted: {result.insertedRows}, Updated: {result.updatedRows},
              Skipped (inactive or unknown employee): {result.skippedRows}, Invalid rows:{' '}
              {result.invalidRows}.
            </p>
            {result.skipped.length > 0 && (
              <MiniTable
                caption="Skipped rows"
                head={['Row', 'Emp No', 'Reason']}
                rows={result.skipped.map((s) => [s.row, s.empNo, s.message])}
              />
            )}
            <ErrorTable errors={result.validationErrors} total={result.invalidRows} />
          </section>
        )}

        <div className="zrv-dialog__actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={pending !== null}
          >
            Close
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void run('preview')}
            disabled={pending !== null || !file}
          >
            {pending === 'preview' ? 'Processing…' : 'Preview'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void run('import')}
            disabled={pending !== null || !preview || preview.summary.validRows === 0}
          >
            {pending === 'import' ? 'Processing…' : 'Import Attendance'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function ErrorTable({ errors, total }: { errors: UploadError[]; total: number }) {
  if (errors.length === 0) return null;
  return (
    <MiniTable
      caption={`Validation errors${total > errors.length ? ` (first ${errors.length} of ${total})` : ''}`}
      head={['Row', 'Employee ID', 'Error']}
      rows={errors.map((e) => [e.row, e.employeeId || '—', e.errors])}
      danger
    />
  );
}

function MiniTable({
  caption,
  head,
  rows,
  danger = false,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
  danger?: boolean;
}) {
  return (
    <div className="zat-mini-table">
      <h3 className={danger ? 'zat-danger-text' : undefined}>{caption}</h3>
      <div className="zrv-ir-tablewrap">
        <table className="zrv-ir-table zrv-report-table">
          <caption className="zrv-hr-sr">{caption}</caption>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} data-label={head[j]}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
