import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, KeyRound, LogIn, Search, Zap } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { Alert, Avatar, Button, Card, Field, Input } from '../components/ui';

interface QuickPerson {
  personId: number;
  personNumber: string;
  fullName: string;
  jobName: string | null;
  hint: string;
}

export function LoginPage({ notice }: { notice?: string } = {}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const cfg = useQuery({ queryKey: ['auth-config'], queryFn: () => api.get<{ quickLogin: boolean; dataMode: string; fusionMode: string }>('/auth/config') });
  const [q, setQ] = useState('');
  const quick = useQuery({
    queryKey: ['quick', q],
    queryFn: () => api.get<QuickPerson[]>(`/auth/quick-list?q=${encodeURIComponent(q)}`),
    enabled: !!cfg.data?.quickLogin,
  });
  const [num, setNum] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Whatever URL the sign-in page was shown on, a fresh sign-in always lands on the dashboard.
  const done = async () => {
    nav('/', { replace: true });
    await qc.invalidateQueries({ queryKey: ['me'] });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.post('/auth/login', { personNumber: num, password: pw });
      await done();
    } catch (x) {
      setErr((x as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const asPerson = async (id: number) => {
    await api.post('/auth/quick', { personId: id });
    await done();
  };
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-2 p-12 text-[#d7efe3] lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-mint/15 text-mint"><GraduationCap className="size-5" /></span>
          <b className="text-[17px] text-white">TrainingHub</b>
        </div>
        <div className="mt-auto max-w-md">
          <h1 className="text-[34px] font-bold leading-tight tracking-tight text-white">Close skill gaps with the right training, approved the right way.</h1>
          <p className="mt-4 text-[14px] text-[#9cc5b2]">Job Skills Matrix, eligibility, approvals, attendance and assessments — one flow for Zamil Plastic Industries.</p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-[12px]">
            {['Profiles per position', 'Rules HR controls', 'Manager → HR Lead'].map((t) => (
              <div key={t} className="rounded-xl border border-white/10 bg-white/5 p-3 text-[#cfe9dc]">{t}</div>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-mint/10 blur-3xl" />
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-[22px] font-bold tracking-tight">Sign in</h2>
          <p className="mt-1 text-[12.5px] text-muted">Use your Fusion person number.</p>
          {notice && <Alert tone="warn" className="mt-4">{notice}</Alert>}
          <form onSubmit={submit} className="mt-6 space-y-3">
            <Field label="Person number"><Input value={num} onChange={(e) => setNum(e.target.value)} autoComplete="username" required /></Field>
            <Field label="Password"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></Field>
            {err && <Alert tone="bad">{err}</Alert>}
            <Button type="submit" variant="primary" className="w-full" loading={busy} icon={<LogIn className="size-4" />}>Sign in</Button>
          </form>
          {cfg.data?.quickLogin && (
            <Card className="mt-8 p-3">
              <div className="mb-2 flex items-center gap-2 px-1 text-[11.5px] font-bold text-opt-ink"><Zap className="size-3.5" /> Development quick sign-in</div>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-fine" />
                <Input className="pl-8" placeholder="Search any employee…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="max-h-72 space-y-0.5 overflow-y-auto scroll-thin">
                {(quick.data ?? []).map((p) => (
                  <button key={p.personId} onClick={() => void asPerson(p.personId)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover" data-testid={`quick-${p.personNumber}`}>
                    <Avatar name={p.fullName} id={p.personId} />
                    <span className="min-w-0">
                      <b className="block truncate text-[12px]">{p.fullName}</b>
                      <small className="block truncate text-[10.5px] text-muted">{p.hint || p.jobName}</small>
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 px-1 text-[10.5px] text-fine">Data: {cfg.data.dataMode} · Fusion: {cfg.data.fusionMode}. Disabled in production.</p>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

export function ChangePasswordPage({ forced }: { forced?: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== again) return setErrs({ again: 'Does not match' });
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: cur, newPassword: next });
      toast.success('Password changed');
      await qc.invalidateQueries({ queryKey: ['me'] });
      nav('/', { replace: true });
    } catch (x) {
      const a = x as ApiError;
      setErrs({ ...a.fields, _: a.message });
    } finally {
      setBusy(false);
    }
  };
  const body = (
    <Card className="mx-auto max-w-md p-6">
      <div className="mb-4 flex items-center gap-2.5"><KeyRound className="size-5 text-req" /><h2 className="text-[17px] font-bold">{forced ? 'Choose your own password' : 'Change password'}</h2></div>
      {forced && <Alert tone="warn" className="mb-4">You signed in with a temporary password. Choose a new one to continue.</Alert>}
      <form onSubmit={submit} className="space-y-3">
        <Field label="Current password" error={errs.currentPassword}><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New password" error={errs.newPassword} hint="At least 10 characters with a letter and a digit."><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Repeat new password" error={errs.again}><Input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" /></Field>
        {errs._ && !errs.currentPassword && !errs.newPassword && <Alert tone="bad">{errs._}</Alert>}
        <Button type="submit" variant="primary" loading={busy} className="w-full">Save password</Button>
      </form>
    </Card>
  );
  return forced ? <div className="flex min-h-dvh items-center p-6">{body}</div> : <div className="pt-6">{body}</div>;
}
