// Setup: eligibility rules (correction 2), approval workflow (correction 3), delegations,
// employees / roles / passwords, settings and the Fusion integration.
import { ArrowDown, ArrowUp, Copy, KeyRound, Plus, RefreshCw, Save, Shield, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  APPROVER_TYPE_LABEL,
  APPROVER_TYPES,
  ROLE_LABEL,
  ROLES,
  STEP_CONDITION_LABEL,
  STEP_CONDITIONS,
  type EligibilityRule,
  type EmployeeRow,
  type RoleCode,
  type SettingKey,
  type SyncRun,
  type WorkflowStep,
  type WorkflowStepInput,
} from '@traininghub/shared';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useAction, useGet, useLookups } from '../lib/data';
import { fmtDateTime } from '../lib/format';
import { PersonPicker } from '../components/domain';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  Field,
  Input,
  Modal,
  PageHeader,
  Segmented,
  Select,
  Spinner,
  Table,
  Tabs,
  Toggle,
} from '../components/ui';
import { DelegationPanel } from './approvals';

type Tab = 'rules' | 'workflow' | 'delegations' | 'people' | 'settings' | 'integration';

export default function Setup() {
  const [tab, setTab] = useState<Tab>('rules');
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Setup"
        sub="Everything here is data, not code. Changes apply to new requests; requests already in approval keep their route. Every change is audited."
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'rules', label: 'Eligibility rules' },
          { value: 'workflow', label: 'Approval workflow' },
          { value: 'delegations', label: 'Delegations' },
          { value: 'people', label: 'Employees & roles' },
          { value: 'settings', label: 'Settings' },
          { value: 'integration', label: 'Fusion integration' },
        ]}
      />
      {tab === 'rules' && <Rules />}
      {tab === 'workflow' && <Workflow />}
      {tab === 'delegations' && <Delegations />}
      {tab === 'people' && <People />}
      {tab === 'settings' && <Settings />}
      {tab === 'integration' && <Integration />}
    </>
  );
}

/* ------------------------------ Eligibility rules ------------------------------ */

function Rules() {
  const rules = useGet<EligibilityRule[]>(['rules'], '/setup/rules');
  if (!rules.data) return <Spinner />;
  return (
    <Card>
      <CardHead
        title="Eligibility rules"
        sub="Block stops a request; Warn lets it through with a visible warning for the approver; Off ignores the rule."
      />
      <Table head={['Rule', 'Mode', 'Parameter', 'Custom message (optional)', '']}>
        {rules.data.map((r) => (
          <RuleRow key={r.code} r={r} />
        ))}
      </Table>
    </Card>
  );
}

function RuleRow({ r }: { r: EligibilityRule }) {
  const [v, setV] = useState({
    mode: r.enabled ? r.severity : 'OFF',
    paramValue: r.paramValue,
    message: r.message,
  });
  useEffect(
    () => setV({ mode: r.enabled ? r.severity : 'OFF', paramValue: r.paramValue, message: r.message }),
    [r],
  );
  const dirty =
    v.mode !== (r.enabled ? r.severity : 'OFF') || v.paramValue !== r.paramValue || v.message !== r.message;
  const save = useAction(
    () =>
      api.put(`/setup/rules/${r.code}`, {
        enabled: v.mode !== 'OFF',
        severity: v.mode === 'OFF' ? r.severity : v.mode,
        paramValue: v.paramValue,
        message: v.message,
      }),
    { success: 'Rule saved', invalidate: [['rules'], ['catalog']] },
  );
  return (
    <tr className={cn(v.mode === 'OFF' && 'opacity-60')}>
      <td className="max-w-80">
        <b>{r.label}</b>
        <div className="font-mono text-[10px] text-fine">{r.code}</div>
      </td>
      <td>
        <Segmented
          size="sm"
          value={v.mode}
          onChange={(m) => setV({ ...v, mode: m })}
          options={[
            { value: 'BLOCK', label: 'Block' },
            { value: 'WARN', label: 'Warn' },
            { value: 'OFF', label: 'Off' },
          ]}
        />
      </td>
      <td>
        {r.paramLabel ? (
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              className="h-8 w-24 py-1"
              value={v.paramValue ?? ''}
              onChange={(e) =>
                setV({ ...v, paramValue: e.target.value === '' ? null : Number(e.target.value) })
              }
              aria-label={`${r.label} parameter`}
            />
            <small className="text-muted">{r.paramLabel}</small>
          </div>
        ) : (
          <span className="text-fine">—</span>
        )}
      </td>
      <td>
        <Input
          className="h-8 py-1"
          placeholder="Default message"
          value={v.message}
          onChange={(e) => setV({ ...v, message: e.target.value })}
        />
      </td>
      <td>
        <Button
          size="sm"
          variant={dirty ? 'primary' : 'ghost'}
          disabled={!dirty}
          loading={save.isPending}
          onClick={() => save.mutate(undefined)}
        >
          Save
        </Button>
      </td>
    </tr>
  );
}

/* ------------------------------ Workflow ------------------------------ */

const toInput = (s: WorkflowStep): WorkflowStepInput => ({
  label: s.label,
  approverType: s.approverType,
  roleCode: s.roleCode,
  personId: s.personId,
  conditionType: s.conditionType,
  conditionValue: s.conditionValue,
  enabled: s.enabled,
});

function Workflow() {
  const wf = useGet<{ steps: WorkflowStep[]; warnings: string[] }>(['workflow'], '/setup/workflow');
  const [steps, setSteps] = useState<WorkflowStepInput[] | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (wf.data) setSteps(wf.data.steps.map(toInput));
  }, [wf.data]);
  const save = useAction(() => api.put('/setup/workflow', { steps }), {
    success: 'Workflow saved · applies to new requests',
    invalidate: [['workflow']],
    onSuccess: () => setErr({}),
    onError: (e) => setErr({ ...e.fields, _: e.message }),
  });
  if (!wf.data || !steps) return <Spinner />;
  const dirty = JSON.stringify(steps) !== JSON.stringify(wf.data.steps.map(toInput));
  const set = (i: number, p: Partial<WorkflowStepInput>) =>
    setSteps(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, d: number) => {
    const n = [...steps];
    [n[i], n[i + d]] = [n[i + d]!, n[i]!];
    setSteps(n);
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardHead
          title="Training request approval route"
          sub="Steps run top to bottom. A step is skipped when its approver is missing, is the requester, or already approved the previous step."
          actions={
            <>
              <Button
                size="sm"
                onClick={() =>
                  setSteps([
                    ...steps,
                    {
                      label: 'New step',
                      approverType: 'ROLE',
                      roleCode: 'HR_LEAD',
                      personId: null,
                      conditionType: 'ALWAYS',
                      conditionValue: null,
                      enabled: true,
                    },
                  ])
                }
                icon={<Plus className="size-3.5" />}
              >
                Add step
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!dirty}
                loading={save.isPending}
                onClick={() => save.mutate(undefined)}
                icon={<Save className="size-3.5" />}
              >
                Save workflow
              </Button>
            </>
          }
        />
        <div className="space-y-2 p-4">
          {steps.map((s, i) => (
            <div key={i} className={cn('rounded-xl border border-line p-3', !s.enabled && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-brand text-[12px] font-bold text-white">
                  {i + 1}
                </span>
                <Input
                  className="h-8 w-40 py-1 font-semibold"
                  value={s.label}
                  onChange={(e) => set(i, { label: e.target.value })}
                  aria-label="Step label"
                />
                <Select
                  className="h-8 w-44 py-1"
                  value={s.approverType}
                  onChange={(e) =>
                    set(i, { approverType: e.target.value as WorkflowStepInput['approverType'] })
                  }
                  aria-label="Approver"
                >
                  {APPROVER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {APPROVER_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
                {s.approverType === 'ROLE' && (
                  <Select
                    className="h-8 w-40 py-1"
                    value={s.roleCode ?? ''}
                    onChange={(e) => set(i, { roleCode: e.target.value as RoleCode })}
                    aria-label="Role"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <Toggle checked={s.enabled} onChange={(v) => set(i, { enabled: v })} label="Enabled" />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={steps.length === 1}
                    onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                    aria-label="Remove step"
                  >
                    <Trash2 className="size-3.5 text-bad" />
                  </Button>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
                {s.approverType === 'PERSON' && (
                  <div className="w-64">
                    <PersonPicker value={s.personId} onChange={(id) => set(i, { personId: id })} />
                  </div>
                )}
                <Select
                  className="h-8 w-56 py-1"
                  value={s.conditionType}
                  onChange={(e) =>
                    set(i, { conditionType: e.target.value as WorkflowStepInput['conditionType'] })
                  }
                  aria-label="Condition"
                >
                  {STEP_CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {STEP_CONDITION_LABEL[c]}
                    </option>
                  ))}
                </Select>
                {s.conditionType === 'COST_ABOVE' && (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-28 py-1"
                      value={s.conditionValue ?? ''}
                      onChange={(e) =>
                        set(i, { conditionValue: e.target.value === '' ? null : Number(e.target.value) })
                      }
                      aria-label="Amount"
                    />
                    <small className="text-muted">SAR</small>
                  </div>
                )}
                {(err[`steps.${i}.roleCode`] ||
                  err[`steps.${i}.personId`] ||
                  err[`steps.${i}.conditionValue`]) && (
                  <small className="font-semibold text-bad">
                    {err[`steps.${i}.roleCode`] ??
                      err[`steps.${i}.personId`] ??
                      err[`steps.${i}.conditionValue`]}
                  </small>
                )}
              </div>
            </div>
          ))}
          {err._ && <Alert tone="bad">{err._}</Alert>}
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHead title="Route preview" />
          <div className="flex flex-wrap items-center gap-2 p-4">
            <Badge tone="info">Employee submits</Badge>
            {steps
              .filter((s) => s.enabled)
              .map((s, i) => (
                <span key={i} className="inline-flex items-center gap-2">
                  →
                  <Badge tone="warn">
                    {s.label}
                    {s.conditionType === 'COST_ABOVE'
                      ? ` (> SAR ${s.conditionValue ?? 0})`
                      : s.conditionType === 'EXTERNAL_ONLY'
                        ? ' (external)'
                        : ''}
                  </Badge>
                </span>
              ))}
            → <Badge tone="ok">Seat confirmed / waitlist</Badge>
          </div>
        </Card>
        {wf.data.warnings.map((w) => (
          <Alert key={w} tone="warn">
            {w}
          </Alert>
        ))}
        <Alert tone="info" title="How roles work">
          A role step (e.g. HR Lead) goes to everyone with that role; the first to act decides. Assign roles
          in Employees & roles.
        </Alert>
      </div>
    </div>
  );
}

function Delegations() {
  return (
    <Card>
      <CardHead
        title="Delegations"
        sub="While a delegation is active, new approval steps for the approver go to the delegate. HR can set them for anyone."
      />
      <div className="p-4">
        <DelegationPanel forOthers />
      </div>
    </Card>
  );
}

/* ------------------------------ Employees, roles, passwords ------------------------------ */

function People() {
  const [q, setQ] = useState('');
  const [inactive, setInactive] = useState(false);
  const [roleOnly, setRoleOnly] = useState(false);
  const list = useGet<EmployeeRow[]>(
    ['employees', q, inactive],
    `/setup/employees?q=${encodeURIComponent(q)}${inactive ? '&inactive=1' : ''}`,
  );
  const L = useLookups();
  const [temp, setTemp] = useState<{ name: string; number: string; pw: string } | null>(null);
  const [grant, setGrant] = useState(false);
  const inv = [['employees'], ['lookups'], ['workflow'], ['me']];
  const revoke = useAction((v: { personId: number; role: RoleCode }) => api.post('/setup/roles/revoke', v), {
    success: 'Role removed',
    invalidate: inv,
  });
  const add = useAction((v: { personId: number; role: RoleCode }) => api.post('/setup/roles', v), {
    success: 'Role granted',
    invalidate: inv,
  });
  const setPos = useAction(
    (v: { personId: number; positionId: number | null }) =>
      api.put(`/setup/employees/${v.personId}/position`, { positionId: v.positionId }),
    { success: 'Position updated', invalidate: inv },
  );
  const reset = useAction(
    (p: EmployeeRow) =>
      api
        .post<{ temporaryPassword: string; personNumber: string }>('/setup/users/reset-password', {
          personId: p.personId,
        })
        .then((r) => ({ ...r, name: p.fullName })),
    {
      onSuccess: (r) => setTemp({ name: r.name, number: r.personNumber, pw: r.temporaryPassword }),
      invalidate: [['employees']],
    },
  );
  const rows = (list.data ?? []).filter((p) => !roleOnly || p.roles.length);
  return (
    <>
      <Card>
        <CardHead
          title="Employees (from Fusion)"
          sub="Names, jobs and managers come from Fusion HCM. TrainingHub adds roles, position overrides and sign-in."
          actions={
            <>
              <Input
                className="h-8 w-56 py-1"
                placeholder="Name, number, job…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <label className="flex items-center gap-1.5 text-[12px]">
                <Toggle checked={roleOnly} onChange={setRoleOnly} label="Only with roles" /> With roles
              </label>
              <label className="flex items-center gap-1.5 text-[12px]">
                <Toggle checked={inactive} onChange={setInactive} label="Include inactive" /> Inactive
              </label>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setGrant(true)}
                icon={<Shield className="size-3.5" />}
              >
                Grant role
              </Button>
            </>
          }
        />
        {!list.data ? (
          <Spinner />
        ) : (
          <Table head={['Employee', 'Fusion job / manager', 'Position', 'Roles', 'Sign-in', '']}>
            {rows.slice(0, 300).map((p) => (
              <tr key={p.personId} className={cn(!p.active && 'opacity-50')}>
                <td>
                  <b>{p.fullName}</b>
                  <div className="text-[10.5px] text-muted">
                    #{p.personNumber} · {p.buCode ?? '—'}
                    {!p.active && ' · inactive'}
                  </div>
                </td>
                <td className="max-w-60">
                  <span className="block truncate">{p.jobName ?? '—'}</span>
                  <span className="text-[10.5px] text-muted">{p.managerName ?? 'No manager'}</span>
                </td>
                <td>
                  <Select
                    className="h-8 w-52 py-1"
                    value={p.positionSource === 'OVERRIDE' ? (p.positionId ?? '') : ''}
                    onChange={(e) =>
                      setPos.mutate({
                        personId: p.personId,
                        positionId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    aria-label="Position override"
                  >
                    <option value="">
                      {p.positionSource === 'JOB' ? `From job: ${p.positionName}` : '— not mapped —'}
                    </option>
                    {L.data?.positions.map((x) => (
                      <option key={x.id} value={x.id}>
                        Override: {x.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {p.roles.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-0.5 rounded-full bg-und-bg px-2 py-0.5 text-[10.5px] font-bold text-und-ink"
                      >
                        {ROLE_LABEL[r]}
                        <button
                          onClick={() => revoke.mutate({ personId: p.personId, role: r })}
                          aria-label={`Remove ${ROLE_LABEL[r]}`}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </td>
                <td>{p.hasLogin ? <Badge tone="ok">Password set</Badge> : <Badge>None</Badge>}</td>
                <td>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!p.active}
                    loading={reset.isPending && reset.variables?.personId === p.personId}
                    onClick={() => reset.mutate(p)}
                    icon={<KeyRound className="size-3.5" />}
                  >
                    Reset password
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {grant && (
        <GrantModal
          onClose={() => setGrant(false)}
          onGrant={(v) => add.mutate(v, { onSuccess: () => setGrant(false) })}
        />
      )}
      <Modal
        open={!!temp}
        onClose={() => setTemp(null)}
        title="Temporary password"
        sub={`${temp?.name} · person number ${temp?.number}`}
        footer={
          <Button variant="primary" onClick={() => setTemp(null)}>
            Done
          </Button>
        }
      >
        <p className="mb-3 text-[12.5px]">
          Give this to the employee. It is shown only once; they must choose their own password at first
          sign-in.
        </p>
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 font-mono text-[15px] font-bold">
          <span className="flex-1">{temp?.pw}</span>
          <Button
            size="sm"
            onClick={() => void navigator.clipboard?.writeText(temp?.pw ?? '')}
            icon={<Copy className="size-3.5" />}
          >
            Copy
          </Button>
        </div>
      </Modal>
    </>
  );
}

function GrantModal({
  onClose,
  onGrant,
}: {
  onClose: () => void;
  onGrant: (v: { personId: number; role: RoleCode }) => void;
}) {
  const [p, setP] = useState<number | null>(null);
  const [r, setR] = useState<RoleCode>('HR_LEAD');
  return (
    <Modal
      open
      onClose={onClose}
      title="Grant a role"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!p} onClick={() => p && onGrant({ personId: p, role: r })}>
            Grant
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Employee">
          <PersonPicker value={p} onChange={setP} />
        </Field>
        <Field label="Role">
          <Select value={r} onChange={(e) => setR(e.target.value as RoleCode)}>
            {ROLES.map((x) => (
              <option key={x} value={x}>
                {ROLE_LABEL[x]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------ Settings ------------------------------ */

function Settings() {
  const s = useGet<{
    definitions: Record<SettingKey, { label: string; type: 'int' | 'flag' | 'text'; def: string }>;
    values: Record<SettingKey, string>;
  }>(['settings'], '/setup/settings');
  const [v, setV] = useState<Record<string, string> | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (s.data) setV(s.data.values);
  }, [s.data]);
  const save = useAction(() => api.put('/setup/settings', { values: v }), {
    success: 'Settings saved',
    invalidate: [['settings']],
    onSuccess: () => setErr({}),
    onError: (e) => setErr(e.fields),
  });
  if (!s.data || !v) return <Spinner />;
  const groups: [string, SettingKey[]][] = [
    [
      'Skill levels & results',
      [
        'LEVEL_RAISE_ON_PASS',
        'LEVEL_CAP_AT_TARGET',
        'NO_EXAM_RAISES_LEVEL',
        'PASS_THEORY_DEFAULT',
        'PASS_PRACTICAL_DEFAULT',
        'MIN_QUESTIONS',
      ],
    ],
    ['Requests', ['WAITLIST_AUTO_PROMOTE', 'REMIND_AFTER_DAYS', 'ANNUAL_BUDGET_SAR']],
    [
      'Job Skills Matrix validation',
      ['JSM_HR_APPROVAL', 'JSM_MIN_REQUIRED', 'JSM_REQUIRE_BEHAVIOURAL', 'JSM_MANDATORY_SKILLS'],
    ],
  ];
  const dirty = JSON.stringify(v) !== JSON.stringify(s.data.values);
  return (
    <div className="space-y-4">
      {groups.map(([title, keys]) => (
        <Card key={title}>
          <CardHead title={title} />
          <div className="divide-y divide-line-2">
            {keys.map((k) => {
              const d = s.data!.definitions[k];
              return (
                <div key={k} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="min-w-60 flex-1">
                    <b className="text-[12.5px]">{d.label}</b>
                    <div className="font-mono text-[10px] text-fine">{k}</div>
                  </div>
                  {d.type === 'flag' ? (
                    <Toggle
                      checked={v[k] === 'Y'}
                      onChange={(x) => setV({ ...v, [k]: x ? 'Y' : 'N' })}
                      label={d.label}
                    />
                  ) : (
                    <Input
                      className={cn('h-8 py-1', d.type === 'text' ? 'w-96' : 'w-32')}
                      value={v[k] ?? ''}
                      onChange={(e) => setV({ ...v, [k]: e.target.value })}
                      aria-label={d.label}
                    />
                  )}
                  {err[k] && <small className="font-semibold text-bad">{err[k]}</small>}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      <div className="sticky bottom-4 flex justify-end">
        <Button
          variant="primary"
          disabled={!dirty}
          loading={save.isPending}
          onClick={() => save.mutate(undefined)}
          icon={<Save className="size-4" />}
        >
          Save settings
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ Integration ------------------------------ */

function Integration() {
  const st = useGet<{
    fusionMode: string;
    dataMode: string;
    fusionUrl: string | null;
    employeeReport: string;
    fallbackReport: string;
    syncHour: number;
    employees: { total: number; active: number };
    runs: SyncRun[];
  }>(['integration'], '/integration/status');
  const [force, setForce] = useState(false);
  const sync = useAction(
    () => api.post<{ statusCode: string; message: string }>('/integration/sync', { force }),
    {
      success: (r) => `${r.statusCode}: ${r.message}`,
      invalidate: [['integration'], ['employees'], ['lookups'], ['jobs']],
    },
  );
  if (!st.data) return <Spinner />;
  const d = st.data;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <Card>
        <CardHead
          title="Oracle Fusion HCM"
          sub="TrainingHub reads only employees from Fusion; everything else lives in its own ADW tables."
        />
        <dl className="grid grid-cols-[150px_1fr] gap-y-2 p-4 text-[12.5px]">
          <dt className="text-muted">Mode</dt>
          <dd>
            <Badge tone={d.fusionMode === 'live' ? 'ok' : 'warn'}>{d.fusionMode}</Badge>
          </dd>
          <dt className="text-muted">Pod</dt>
          <dd className="break-all">{d.fusionUrl ?? '—'}</dd>
          <dt className="text-muted">Employee report</dt>
          <dd className="break-all font-mono text-[11px]">{d.employeeReport}</dd>
          <dt className="text-muted">Fallback report</dt>
          <dd className="break-all font-mono text-[11px]">{d.fallbackReport}</dd>
          <dt className="text-muted">Nightly sync</dt>
          <dd>{String(d.syncHour).padStart(2, '0')}:00 Riyadh</dd>
          <dt className="text-muted">Data store</dt>
          <dd>
            <Badge tone={d.dataMode === 'oracle' ? 'ok' : 'warn'}>
              {d.dataMode === 'oracle' ? 'Oracle ADW' : 'memory (dev)'}
            </Badge>
          </dd>
          <dt className="text-muted">Employees</dt>
          <dd>
            {d.employees.active} active · {d.employees.total} total
          </dd>
        </dl>
        <div className="flex flex-wrap items-center gap-3 border-t border-line-2 px-4 py-3">
          <Button
            variant="primary"
            loading={sync.isPending}
            onClick={() => sync.mutate(undefined)}
            icon={<RefreshCw className="size-4" />}
          >
            Sync employees now
          </Button>
          <label className="flex items-center gap-1.5 text-[12px]">
            <Toggle checked={force} onChange={setForce} label="Force" /> Force (skip the mass-deactivation
            guard)
          </label>
        </div>
      </Card>
      <Card>
        <CardHead title="Sync history" />
        <Table head={['Started', 'Status', 'Read', 'New', 'Changed', 'Deactivated', 'Message']}>
          {d.runs.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{fmtDateTime(r.startedAt)}</td>
              <td>
                <Badge tone={r.status === 'SUCCESS' ? 'ok' : r.status === 'RUNNING' ? 'info' : 'bad'}>
                  {r.status}
                </Badge>
              </td>
              <td className="tabular">{r.rowsRead}</td>
              <td className="tabular">{r.inserted}</td>
              <td className="tabular">{r.updated}</td>
              <td className="tabular">{r.deactivated}</td>
              <td className="max-w-72 text-[11px] text-muted">{r.message}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
