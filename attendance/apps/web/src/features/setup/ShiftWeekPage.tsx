// Manage Sub Shifts (CI3 /shift-details/create?shift_uuid=): pick a shift, then edit its seven
// weekday rows (punch in, punch out, gross time). Saved in one transaction.
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  mutationResultSchema,
  shiftWeekInputSchema,
  shiftWeekSchema,
  type ShiftWeek,
} from '@attendance/shared';
import { ContentSkeleton } from '../../components/Feedback';
import { OrvexaIcon } from '../../components/OrvexaIcon';
import { StatusBadge } from '../../components/StatusBadges';
import { api, ApiError, errorMessage } from '../../lib/api';
import { display, formatIsoDate } from '../../lib/format';
import { useSave } from '../../lib/useSave';
import { useShiftChoices } from './useShiftChoices';

type DayValues = { punchIn: string; punchOut: string; grossTime: string };
const FIELDS = [
  ['punchIn', 'Punch In'],
  ['punchOut', 'Punch Out'],
  ['grossTime', 'Gross Time'],
] as const;

export default function ShiftWeekPage() {
  const { uuid } = useParams();
  const navigate = useNavigate();
  const choices = useShiftChoices();
  const week = useQuery({
    queryKey: ['shift-week', uuid],
    queryFn: ({ signal }) => api(`/shift-details/${uuid}`, shiftWeekSchema, { signal }),
    enabled: Boolean(uuid),
  });

  return (
    <div className="zrv-hr zrv-hr--shift-week zrv-hr--compact zrv-ir zrv-ir--fitted zrv-ir--responsive zat-report">
      <header className="zrv-ir-head">
        <div className="zrv-ir-head__title">
          <nav aria-label="Breadcrumb">
            <ol className="zrv-ir-crumb">
              <li>Attendance</li>
              <li>
                <Link to="/shift-details">Sub Shifts</Link>
              </li>
              <li>Manage</li>
            </ol>
          </nav>
          <h1 className="zrv-hr-title">Manage Sub Shifts</h1>
          <p className="zrv-hr-sub">Choose a shift, then set its times for each day of the week.</p>
        </div>
      </header>

      <section className="zrv-ir-card zat-section">
        <label className="zrv-ir-field zat-shift-picker" htmlFor="shift-week-select">
          <span>Shift name</span>
          <select
            id="shift-week-select"
            value={uuid ?? ''}
            onChange={(event) =>
              navigate(
                event.target.value
                  ? `/shift-details/${event.target.value}`
                  : '/shift-details/manage',
              )
            }
            disabled={choices.isPending}
          >
            <option value="">Select Shift</option>
            {choices.data?.map((shift) => (
              <option key={shift.uuid} value={shift.uuid}>
                {shift.name}
                {shift.status && shift.status !== 'ACTIVE' ? ` (${shift.status})` : ''}
              </option>
            ))}
          </select>
        </label>
      </section>

      {!uuid ? (
        <p className="zrv-admin-state" role="status">
          Please select a shift first. If detail rows already exist, they will be loaded. Otherwise,
          empty Sunday to Saturday rows will be shown.
        </p>
      ) : week.isPending ? (
        <ContentSkeleton label="Loading shift details" />
      ) : week.isError ? (
        <div className="zrv-admin-state zrv-admin-state--error" role="alert">
          <p>{errorMessage(week.error)}</p>
          <button type="button" className="btn-secondary" onClick={() => void week.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <WeekEditor key={week.data.shift.uuid + week.dataUpdatedAt} week={week.data} />
      )}
    </div>
  );
}

function WeekEditor({ week }: { week: ShiftWeek }) {
  const save = useSave(['shift-weeks', 'shift-week']);
  const [days, setDays] = useState<DayValues[]>(() =>
    week.days.map((d) => ({
      punchIn: d.punchIn ?? '',
      punchOut: d.punchOut ?? '',
      grossTime: d.grossTime ?? '',
    })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { shift } = week;

  const set = (index: number, field: keyof DayValues, value: string) =>
    setDays((current) => current.map((day, i) => (i === index ? { ...day, [field]: value } : day)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = shiftWeekInputSchema.safeParse({ days });
    const toErrors = (issues: unknown) => {
      const map: Record<string, string> = {};
      for (const issue of (Array.isArray(issues) ? issues : []) as {
        path?: unknown;
        message?: string;
      }[]) {
        const path = Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path ?? '');
        const key = path.replace(/^days\./, '');
        if (issue.message && !map[key]) map[key] = issue.message;
      }
      return map;
    };
    if (!parsed.success) {
      setErrors(toErrors(parsed.error.issues));
      setFormError('Please correct the highlighted errors and try again.');
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await save(() =>
        api(`/shift-details/${shift.uuid}`, mutationResultSchema, {
          method: 'PUT',
          body: { days },
        }),
      );
    } catch (error) {
      const issues =
        error instanceof ApiError
          ? (error.details as { issues?: unknown } | undefined)?.issues
          : null;
      const mapped = toErrors(issues);
      setErrors(mapped);
      setFormError(
        Object.keys(mapped).length
          ? 'Please correct the highlighted errors and try again.'
          : errorMessage(error),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <section className="zrv-ir-card zat-section" aria-label="Shift header details">
        <header className="zrv-ir-card__head">
          <h2>Shift Header Details</h2>
        </header>
        <dl className="zat-facts">
          {(
            [
              ['Shift Name', display(shift.shiftName)],
              ['Status', <StatusBadge key="s" status={shift.status} />],
              ['Start Date', formatIsoDate(shift.startDate)],
              ['End Date', formatIsoDate(shift.endDate)],
              ['Check In', display(shift.checkIn)],
              ['Check Out', display(shift.checkOut)],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <form className="zrv-ir-card zat-section" onSubmit={(event) => void submit(event)} noValidate>
        <header className="zrv-ir-card__head">
          <h2>Shift Detail Rows</h2>
          <p className="zat-muted">
            {week.hasExistingDetails
              ? 'Existing records found for this shift. Saving will update them.'
              : 'No detail rows found for this shift. Saving will create 7 rows.'}
          </p>
        </header>
        <div className="zrv-ir-tablewrap">
          <table className="zrv-ir-table zrv-report-table zat-week-table">
            <caption className="zrv-hr-sr">Weekday times for {shift.shiftName}</caption>
            <thead>
              <tr>
                <th scope="col" className="zat-col-num">
                  #
                </th>
                <th scope="col">Weekday</th>
                {FIELDS.map(([, label]) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {week.days.map((day, index) => (
                <tr key={day.dayNo}>
                  <td className="zat-col-num" data-label="#">
                    {day.dayNo}
                  </td>
                  <th scope="row" data-label="Weekday">
                    {day.weekdayName}
                  </th>
                  {FIELDS.map(([field, label]) => {
                    const id = `day-${day.dayNo}-${field}`;
                    const error = errors[`${index}.${field}`];
                    return (
                      <td key={field} data-label={label}>
                        <label htmlFor={id} className="zrv-hr-sr">
                          {day.weekdayName} {label}
                        </label>
                        <input
                          id={id}
                          type="time"
                          step={60}
                          className="ux-input"
                          value={days[index]![field]}
                          disabled={pending}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? `${id}-error` : undefined}
                          onChange={(event) => set(index, field, event.target.value)}
                        />
                        {error && (
                          <small id={`${id}-error`} className="zrv-auth-field-error">
                            {error}
                          </small>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {formError && (
          <p className="zrv-admin-feedback zrv-admin-feedback--error" role="alert">
            {formError}
          </p>
        )}
        <div className="zrv-dialog__actions">
          <Link className="btn-secondary" to="/shift-details">
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={pending}>
            <OrvexaIcon name="save" size={16} />
            {pending
              ? 'Saving…'
              : week.hasExistingDetails
                ? 'Update Shift Details'
                : 'Save Shift Details'}
          </button>
        </div>
      </form>
    </>
  );
}
