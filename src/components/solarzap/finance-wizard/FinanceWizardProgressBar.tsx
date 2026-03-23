import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FinanceWizardStep } from '@/types/finance';

const STEP_LABELS: Array<{ step: FinanceWizardStep; title: string; subtitle: string }> = [
  { step: 1, title: 'Valores', subtitle: 'Venda, custo e notas' },
  { step: 2, title: 'Pagamento', subtitle: 'Modalidades padrão' },
  { step: 3, title: 'Parcelas', subtitle: 'Entrada e vencimentos' },
  { step: 4, title: 'Revisão', subtitle: 'Conferência final' },
];

interface FinanceWizardProgressBarProps {
  currentStep: FinanceWizardStep;
}

export function FinanceWizardProgressBar({ currentStep }: FinanceWizardProgressBarProps) {
  const progressPct = (currentStep / STEP_LABELS.length) * 100;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STEP_LABELS.map((item) => {
          const isDone = item.step < currentStep;
          const isActive = item.step === currentStep;

          return (
            <div
              key={item.step}
              className={cn(
                'rounded-xl border px-3 py-3 text-left transition-colors',
                isActive && 'border-primary bg-primary/5 shadow-sm',
                isDone && 'border-emerald-500/40 bg-emerald-500/5',
                !isDone && !isActive && 'border-border bg-background',
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold',
                    isDone && 'border-emerald-600 bg-emerald-600 text-white',
                    isActive && 'border-primary bg-primary text-primary-foreground',
                    !isDone && !isActive && 'border-muted-foreground/30 text-muted-foreground',
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : item.step}
                </div>
                <div className="min-w-0">
                  <p className={cn('text-sm font-semibold', !isActive && !isDone && 'text-muted-foreground')}>
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}
