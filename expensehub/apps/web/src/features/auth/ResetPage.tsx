// API §2 password set/reset (TRD §5: emailed one-time link, valid 24 h).
import { zodResolver } from '@hookform/resolvers/zod';
import { passwordRequestSchema, passwordSchema, type PasswordRequest } from '@expensehub/shared';
import { ArrowLeft, Check, CircleAlert, MailCheck, ShieldCheck, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { cn } from '../../lib/cn';
import { AuthLayout } from './AuthLayout';
import { usePasswordRequest, usePasswordReset } from './hooks';

export function ResetPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  return <AuthLayout>{token ? <SetPassword token={token} /> : <RequestLink />}</AuthLayout>;
}

function BackToSignIn() {
  const { t } = useTranslation();
  return (
    <Link
      to="/login"
      className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
    >
      <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
      {t('reset.backToSignIn')}
    </Link>
  );
}

function RequestLink() {
  const { t } = useTranslation();
  const request = usePasswordRequest();
  const form = useForm<PasswordRequest>({
    resolver: zodResolver(passwordRequestSchema),
    defaultValues: { username: '' },
  });

  if (request.isSuccess) {
    return (
      <div>
        <BackToSignIn />
        <span className="grid size-12 place-items-center rounded-full bg-pass/10 text-pass-text">
          <MailCheck aria-hidden className="size-6" />
        </span>
        <h1 className="mt-5 text-title font-semibold">{t('reset.requestSent')}</h1>
        <p className="mt-2 text-sm text-muted">
          {t('reset.requestSentBody', { username: request.variables })}
        </p>
        {import.meta.env.DEV && (
          <Button asChild variant="secondary" className="mt-6">
            <Link to="/dev/mail">{t('reset.openDevMail')}</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      <BackToSignIn />
      <h1 className="text-title font-semibold">{t('reset.requestTitle')}</h1>
      <p className="mt-1.5 text-sm text-muted">{t('reset.requestBody')}</p>
      {request.error && (
        <p
          role="alert"
          className="mt-6 flex items-start gap-2 rounded-input bg-block/10 px-3 py-2.5 text-sm text-block"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {request.error.message}
        </p>
      )}
      <form
        noValidate
        className="mt-6 space-y-4"
        onSubmit={form.handleSubmit(({ username }) => request.mutate(username))}
      >
        <Field label={t('login.username')} error={form.formState.errors.username?.message}>
          <Input autoComplete="username" inputMode="numeric" {...form.register('username')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={request.isPending}>
          {t('reset.requestSubmit')}
        </Button>
      </form>
    </div>
  );
}

function SetPassword({ token }: { token: string }) {
  const { t } = useTranslation();
  const reset = usePasswordReset();
  const schema = z
    .object({ password: passwordSchema, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: t('reset.mismatch') });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });
  const password = form.watch('password');

  // Policy visible while typing (UI-UX §1.2).
  const rules = [
    { label: t('reset.ruleLength'), ok: password.length >= 10 },
    { label: t('reset.ruleLetter'), ok: /[A-Za-z]/.test(password) },
    { label: t('reset.ruleNumber'), ok: /\d/.test(password) },
  ];

  if (reset.isSuccess) {
    return (
      <div>
        <span className="grid size-12 place-items-center rounded-full bg-pass/10 text-pass-text">
          <ShieldCheck aria-hidden className="size-6" />
        </span>
        <h1 className="mt-5 text-title font-semibold">{t('reset.done')}</h1>
        <p className="mt-2 text-sm text-muted">{t('reset.doneBody')}</p>
        <Button asChild size="lg" className="mt-6 w-full">
          <Link to="/login">{t('reset.toSignIn')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <BackToSignIn />
      <h1 className="text-title font-semibold">{t('reset.setTitle')}</h1>
      <p className="mt-1.5 text-sm text-muted">{t('reset.setBody')}</p>
      {reset.error && (
        <p
          role="alert"
          className="mt-6 flex items-start gap-2 rounded-input bg-block/10 px-3 py-2.5 text-sm text-block"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {reset.error.message}
        </p>
      )}
      <form
        noValidate
        className="mt-6 space-y-4"
        onSubmit={form.handleSubmit(({ password: pw }) => reset.mutate({ token, password: pw }))}
      >
        <Field
          label={t('reset.newPassword')}
          error={form.formState.errors.password?.message}
          hint={
            <ul className="mt-1 space-y-1">
              {rules.map((rule) => (
                <li
                  key={rule.label}
                  className={cn('flex items-center gap-1.5', rule.ok && 'text-pass-text')}
                >
                  {rule.ok ? (
                    <Check aria-hidden className="size-3.5" />
                  ) : (
                    <X aria-hidden className="size-3.5" />
                  )}
                  {rule.label}
                </li>
              ))}
            </ul>
          }
        >
          <PasswordInput autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Field label={t('reset.confirmPassword')} error={form.formState.errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={reset.isPending}>
          {t('reset.setSubmit')}
        </Button>
      </form>
    </div>
  );
}
