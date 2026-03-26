import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LeadTask } from '@/types/solarzap';
import { formatLeadTaskDueLabel, getLeadTaskDueState } from '@/lib/leadNextActions';

type LeadNextActionBadgeProps = {
  task: LeadTask | null;
  showEmpty?: boolean;
  className?: string;
};

const badgeClassByState: Record<string, string> = {
  overdue: 'border-red-500/25 bg-red-500/10 text-red-200',
  today: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
  upcoming: 'border-sky-500/25 bg-sky-500/10 text-sky-200',
  unscheduled: 'border-border/70 bg-muted/30 text-muted-foreground',
  none: 'border-dashed border-border/70 bg-transparent text-muted-foreground/80',
};

export function LeadNextActionBadge({ task, showEmpty = false, className }: LeadNextActionBadgeProps) {
  const dueState = getLeadTaskDueState(task);
  if (!task && !showEmpty) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex h-5 max-w-full items-center rounded-full px-2.5 text-[10px] font-medium tracking-[0.01em]',
        badgeClassByState[dueState],
        className,
      )}
      title={task ? `${task.title} - ${formatLeadTaskDueLabel(task)}` : 'Sem proxima acao'}
    >
      {formatLeadTaskDueLabel(task)}
    </Badge>
  );
}
