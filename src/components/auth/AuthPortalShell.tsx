import type { ReactNode } from 'react';

import AuthBenefitRail from '@/components/auth/AuthBenefitRail';
import { cn } from '@/lib/utils';

type AuthPortalShellProps = {
  badge?: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  panelClassName?: string;
  planLabel?: string | null;
  planDescription?: string | null;
  rail?: ReactNode;
};

export default function AuthPortalShell({
  badge,
  title,
  description,
  children,
  footer,
  panelClassName,
  planLabel,
  planDescription,
  rail,
}: AuthPortalShellProps) {
  return (
    <div className="auth-portal-shell min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-portal-glow auth-portal-glow-primary" />
        <div className="auth-portal-glow auth-portal-glow-secondary" />
        <div className="auth-portal-grid-lines" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-3rem)] max-w-7xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,560px)] lg:gap-8">
          <aside className="auth-portal-aside animate-in fade-in slide-in-from-left-4 duration-500">
            {rail || <AuthBenefitRail planLabel={planLabel} planDescription={planDescription} />}
          </aside>

          <section className="auth-portal-panel animate-in fade-in slide-in-from-right-4 duration-500">
            <div className={cn('auth-portal-form-surface', panelClassName)}>
              <div className="space-y-4">
                {badge}
                <div className="space-y-2">
                  <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">{title}</h2>
                  <p className="max-w-md text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
                </div>
              </div>

              <div className="mt-8">{children}</div>

              {footer && <div className="mt-8 border-t border-border/70 pt-5 text-sm text-muted-foreground">{footer}</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}