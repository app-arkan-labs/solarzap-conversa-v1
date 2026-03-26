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
  overdue: 'border-red-200 bg-red-50 text-red-700',
  today: 'border-amber-200 bg-amber-50 text-amber-700',
  upcoming: 'border-blue-200 bg-blue-50 text-blue-700',
  unscheduled: 'border-slate-200 bg-slate-50 text-slate-700',
  none: 'border-dashed border-slate-200 bg-transparent text-muted-foreground',
};

export function LeadNextActionBadge({ task, showEmpty = false, className }: LeadNextActionBadgeProps) {
  const dueState = getLeadTaskDueState(task);
  if (!task && !showEmpty) return null;

  return (
    <Badge
      variant="outline"
      className={cn('max-w-full truncate text-[10px] font-medium', badgeClassByState[dueState], className)}
      title={task ? `${task.title} - ${formatLeadTaskDueLabel(task)}` : 'Sem proxima acao'}
    >
      {formatLeadTaskDueLabel(task)}
    </Badge>
  );
}
