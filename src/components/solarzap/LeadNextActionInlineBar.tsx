import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatLeadTaskDueLabel } from '@/lib/leadNextActions';
import type { LeadTask } from '@/types/solarzap';

type LeadNextActionInlineBarProps = {
  nextAction: LeadTask | null;
  isLoading?: boolean;
  showActionsToggle?: boolean;
  isActionsOpen?: boolean;
  onToggleActions?: () => void;
  actionsSlot?: ReactNode;
};

export function LeadNextActionInlineBar({
  nextAction,
  isLoading = false,
  showActionsToggle = false,
  isActionsOpen = false,
  onToggleActions,
  actionsSlot,
}: LeadNextActionInlineBarProps) {
  const hasScheduledNextAction = Boolean(nextAction?.dueAt);
  const dueLabel = hasScheduledNextAction ? formatLeadTaskDueLabel(nextAction) : '';
  const description = hasScheduledNextAction ? String(nextAction?.title || '').trim() : 'nao definida';

  return (
    <div className="flex h-11 items-center gap-2 border-b border-border/60 bg-background/35 px-3">
      {showActionsToggle ? (
        <button
          type="button"
          onClick={onToggleActions}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            isActionsOpen && 'bg-muted text-foreground shadow-sm',
          )}
          title={isActionsOpen ? 'Fechar acoes' : 'Abrir acoes'}
        >
          <FileText className="h-4 w-4" />
        </button>
      ) : null}
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
      {actionsSlot ? <div className="ml-2 flex items-center gap-2">{actionsSlot}</div> : null}
    </div>
  );
}
