import { Button } from '@/components/ui/button';
import { formatLeadTaskDueLabel } from '@/lib/leadNextActions';
import type { LeadTask } from '@/types/solarzap';

type LeadNextActionInlineBarProps = {
  nextAction: LeadTask | null;
  isLoading?: boolean;
  onOpen?: () => void;
};

export function LeadNextActionInlineBar({
  nextAction,
  isLoading = false,
  onOpen,
}: LeadNextActionInlineBarProps) {
  const hasScheduledNextAction = Boolean(nextAction?.dueAt);
  const dueLabel = hasScheduledNextAction ? formatLeadTaskDueLabel(nextAction) : '';
  const description = hasScheduledNextAction ? String(nextAction?.title || '').trim() : 'nao definida';
  const actionLabel = hasScheduledNextAction ? 'Editar' : 'Definir';

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

      {onOpen ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-full px-3 text-[11px] text-primary hover:bg-primary/10 hover:text-primary"
          onClick={onOpen}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
