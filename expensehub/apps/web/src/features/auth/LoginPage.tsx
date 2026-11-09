// API §2 sign-in (OQ-22 proposal: local accounts, username = HCM person number).
import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, type LoginRequest } from '@expensehub/shared';
import { CircleAlert, Info } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { clearSigningOut, safeNext } from '../../lib/session';
import { AuthLayout } from './AuthLayout';
import { useLogin, useMe } from './hooks';

// D-33: the quick-login picker is compiled out of production builds entirely.
const DevQuickLogin = import.meta.env.DEV ? lazy(() => import('./DevQuickLogin')) : null;

export function LoginPage({ ssoNotice }: { ssoNotice?: string } = {}) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const expired = params.get('expired') === '1';
  const navigate = useNavigate();
  const me = useMe();
  const login = useLogin();
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { username: '', password: '' },
  });

  useEffect(() => clearSigningOut(), []);

  if (me.data) return <Navigate to={next} replace />;

  const onSubmit = form.handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate(next, { replace: true }) }),
  );
  const { errors } = form.formState;

  return (
    <AuthLayout>
      <h1 className="text-title font-semibold">{t('login.title')}</h1>
      <p className="mt-1.5 text-sm text-muted">{t('login.subtitle')}</p>

      {ssoNotice && (
        <p role="alert" className="mt-4 rounded-input bg-info/10 px-3 py-2.5 text-sm text-info">
          {ssoNotice}
        </p>
      )}

      {expired && !login.error && (
        <p
          role="status"
          className="mt-6 flex items-start gap-2 rounded-input bg-info/10 px-3 py-2.5 text-sm text-info"
        >
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t('login.expired')}
        </p>
      )}
      {login.error && (
        <p
          role="alert"
          className="mt-6 flex items-start gap-2 rounded-input bg-block/10 px-3 py-2.5 text-sm text-block"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {login.error.message}
        </p>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <Field label={t('login.username')} error={errors.username?.message}>
          <Input autoComplete="username" inputMode="numeric" {...form.register('username')} />
        </Field>
        <Field
          label={t('login.password')}
          error={errors.password?.message}
          labelAction={
            <Link
              to="/reset"
              className="text-xs font-medium text-brand-solid hover:underline dark:text-brand"
            >
              {t('reset.requestTitle')}
            </Link>
          }
        >
          <PasswordInput autoComplete="current-password" {...form.register('password')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
          {login.isPending ? t('login.submitting') : t('login.submit')}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-muted">
        <Link to="/reset" className="hover:text-ink hover:underline">
          {t('login.forgot')}
        </Link>
      </p>

      {DevQuickLogin && (
        <Suspense fallback={null}>
          <DevQuickLogin onSignedIn={() => navigate(next, { replace: true })} />
        </Suspense>
      )}
    </AuthLayout>
  );
}
