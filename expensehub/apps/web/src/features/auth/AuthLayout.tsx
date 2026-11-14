// Split screen for sign-in pages: brand story on the start side (≥ lg), form on the end side.
import { BadgeCheck, Landmark, QrCode } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from '../../components/brand/Logo';
import { ThemeToggle } from '../../components/ThemeToggle';

export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const points = [
    { icon: BadgeCheck, text: t('login.heroPoint1') },
    { icon: QrCode, text: t('login.heroPoint2') },
    { icon: Landmark, text: t('login.heroPoint3') },
  ];

  return (
    <div className="grid min-h-dvh bg-canvas text-ink lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-hero p-12 text-hero-fg lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute -end-32 -top-32 size-[28rem] rounded-full bg-brand/30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -start-20 size-[24rem] rounded-full bg-info/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        />
        <div className="relative">
          <Logo inverse />
        </div>
        <div className="relative my-auto max-w-md">
          <h2 className="text-[2.5rem] font-semibold leading-[1.1] tracking-tight">
            {t('login.heroTitle')}
          </h2>
          <p className="mt-4 text-base text-hero-muted">{t('login.heroBody')}</p>
          <ul className="mt-10 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm">
                <span className="grid size-9 place-items-center rounded-input bg-white/10 ring-1 ring-inset ring-white/15">
                  <Icon aria-hidden className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-hero-muted">{t('app.company')} · IPP · FPP · APP</p>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <div className="flex items-center justify-between px-4 py-4 sm:px-8">
          <div className="lg:invisible">
            <Logo />
          </div>
          <ThemeToggle />
        </div>
        <main
          id="main"
          className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:items-center sm:px-8"
        >
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
