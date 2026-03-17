import React from 'react';
import { ArrowRight, BadgeCheck, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type OnboardingStep = {
  key: string;
  title: string;
};

type OnboardingWizardShellProps = {
  steps: readonly OnboardingStep[];
  currentStepKey: string;
  title: string;
  description: string;
  children: React.ReactNode;
  isSubmitting?: boolean;
  onBack?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
  canSkip?: boolean;
  nextLabel?: string;
};

export default function OnboardingWizardShell({
  steps,
  currentStepKey,
  title,
  description,
  children,
  isSubmitting = false,
  onBack,
  onNext,
  onSkip,
  canSkip = false,
  nextLabel = 'Continuar',
}: OnboardingWizardShellProps) {
  const currentIndex = Math.max(steps.findIndex((step) => step.key === currentStepKey), 0);
  const progressPercent = Math.round(((currentIndex + 1) / Math.max(steps.length, 1)) * 100);
  const nextStep = currentIndex + 1 < steps.length ? steps[currentIndex + 1] : null;
  const completedSteps = steps.slice(0, currentIndex);

  return (
    <div className="auth-portal-shell min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-portal-glow auth-portal-glow-primary" />
        <div className="auth-portal-glow auth-portal-glow-secondary" />
        <div className="auth-portal-grid-lines" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-3rem)] max-w-7xl items-start">
        <div className="grid w-full gap-6 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="auth-portal-aside lg:sticky lg:top-6">
            <div className="space-y-5">
              <div className="brand-logo-disc h-14 w-14">
                <img src="/logo.png" alt="SolarZap" className="brand-logo-image" />
              </div>

              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/18 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  Onboarding guiado
                </div>
                <h2 className="text-3xl font-semibold tracking-tight text-foreground">Ative sua operacao com a mesma linguagem do portal.</h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  Cada etapa do onboarding prepara o ambiente para que a entrada no app e a passagem por billing parecam parte da mesma experiencia.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="auth-portal-info-card">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Progresso</p>
                    <p className="text-sm font-semibold text-foreground">{progressPercent}%</p>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--secondary)))] transition-all" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <p className="text-sm text-muted-foreground">Etapa {currentIndex + 1} de {steps.length}</p>
                </div>
              </div>

              <div className="auth-portal-highlight-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Agora</p>
                    <p className="text-lg font-semibold text-foreground">{steps[currentIndex]?.title || title}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{description}</p>
                  </div>
                  <BadgeCheck className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/72 px-4 py-3 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.42)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Proxima etapa</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{nextStep?.title || 'Entrada no app'}</p>
                      <p className="text-sm text-muted-foreground">
                        {nextStep ? 'Ao concluir, a jornada avanca sem troca brusca de contexto.' : 'Concluindo aqui, o usuario entra no app com tudo preparado.'}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 flex-shrink-0 text-primary" />
                  </div>
                </div>
              </div>

              {completedSteps.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {completedSteps.map((step) => (
                    <span key={step.key} className="rounded-full border border-secondary/20 bg-secondary/10 px-3 py-1 text-xs font-medium text-secondary">
                      {step.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <section className="space-y-6">
            <div className="auth-portal-form-surface">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  Etapa {currentIndex + 1} de {steps.length}
                </p>
                <p className="text-sm text-muted-foreground">{progressPercent}%</p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--secondary)))] transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {steps.map((step, index) => {
                  const isActive = step.key === currentStepKey;
                  const isDone = index < currentIndex;
                  return (
                    <span
                      key={step.key}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs',
                        isActive && 'border-primary/25 bg-primary/10 text-primary',
                        isDone && 'border-secondary/20 bg-secondary/10 text-secondary',
                        !isActive && !isDone && 'border-border bg-card/92 text-muted-foreground',
                      )}
                    >
                      {step.title}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="auth-portal-form-surface">
              <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              <div className="mt-6">{children}</div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                <div>
                  {onBack && (
                    <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
                      Voltar
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canSkip && onSkip && (
                    <Button type="button" variant="ghost" onClick={onSkip} disabled={isSubmitting}>
                      Pular por agora
                    </Button>
                  )}
                  {onNext && (
                    <Button type="button" onClick={onNext} disabled={isSubmitting}>
                      {nextLabel}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
