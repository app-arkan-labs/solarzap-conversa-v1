import React from 'react';
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

  return (
    <div className="min-h-screen app-shell-bg p-4 sm:p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="rounded-2xl border border-border/70 bg-background/90 p-5 shadow-[0_22px_60px_-34px_rgba(15,23,42,0.35)] backdrop-blur-xl">
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

        <div className="rounded-2xl border border-border/70 bg-background/90 p-5 shadow-[0_22px_60px_-34px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-6">
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
      </div>
    </div>
  );
}
