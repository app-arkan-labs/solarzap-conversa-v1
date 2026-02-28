import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEP_LABELS = [
  'Tipo de projeto',
  'Local e consumo',
  'Equipamento',
  'Pagamento',
  'Personalizacao',
  'Revisao',
];

interface WizardProgressBarProps {
  currentStep: number;
}

export function WizardProgressBar({ currentStep }: WizardProgressBarProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-2">
        {STEP_LABELS.map((label, index) => {
          const step = index + 1;
          const isDone = step < currentStep;
          const isActive = step === currentStep;

          return (
            <div key={label} className="flex flex-col items-center gap-1 text-center">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold',
                  isDone && 'border-green-600 bg-green-600 text-white',
                  isActive && 'border-primary bg-primary text-primary-foreground',
                  !isDone && !isActive && 'border-muted-foreground/40 text-muted-foreground',
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : step}
              </div>
              <span className={cn(
                'text-[10px] leading-tight',
                isActive ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full bg-primary transition-all duration-300"
          style={{ width: `${(currentStep / STEP_LABELS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
