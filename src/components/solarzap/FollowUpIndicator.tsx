import React from 'react';
import { cn } from '@/lib/utils';

interface FollowUpIndicatorProps {
  step: number;
  enabled: boolean;
  compact?: boolean;
}

export function FollowUpIndicator({ step, enabled, compact = false }: FollowUpIndicatorProps) {
  const normalizedStep = Number.isFinite(Number(step))
    ? Math.max(0, Math.min(5, Math.trunc(Number(step))))
    : 0;

  const dotSizeClass = compact ? 'h-1.5 w-1.5' : 'h-2 w-2';
  const title = enabled
    ? normalizedStep >= 5
      ? 'Follow-up exaurido (5/5)'
      : `Follow-up ${normalizedStep}/5`
    : 'Follow-up desabilitado';

  return (
    <div className={cn('inline-flex items-center gap-1', !enabled && 'opacity-60')} title={title}>
      {Array.from({ length: 5 }, (_, index) => {
        const dotStep = index + 1;
        const isFilled = enabled && dotStep <= normalizedStep;
        const isExhausted = enabled && normalizedStep >= 5;

        return (
          <span
            key={dotStep}
            className={cn(
              'rounded-full border border-slate-300',
              dotSizeClass,
              isExhausted
                ? 'bg-red-500 border-red-500'
                : isFilled
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'bg-slate-200'
            )}
          />
        );
      })}
    </div>
  );
}
