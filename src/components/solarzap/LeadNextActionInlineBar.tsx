import { formatLeadTaskDueLabel } from '@/lib/leadNextActions';
import type { LeadTask } from '@/types/solarzap';

type LeadNextActionInlineBarProps = {
  nextAction: LeadTask | null;
  isLoading?: boolean;
};

export function LeadNextActionInlineBar({
  nextAction,
  isLoading = false,
}: LeadNextActionInlineBarProps) {
  const hasScheduledNextAction = Boolean(nextAction?.dueAt);
  const dueLabel = hasScheduledNextAction ? formatLeadTaskDueLabel(nextAction) : '';
  const description = hasScheduledNextAction ? String(nextAction?.title || '').trim() : 'nao definida';

  return (
    <div className="flex items-center gap-3 border-b border-border/60 bg-background/40 px-4 py-2">
      <div className="min-w-0 flex-1 text-xs text-muted-foreground">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Proxima acao
        </span>
        <span className="text-foreground/90">
          {isLoading
            ? 'atualizando...'
            : hasScheduledNextAction
              ? ` (${dueLabel}): ${description}`
              : ': nao definida'}
        </span>
      </div>
    </div>
  );
}
