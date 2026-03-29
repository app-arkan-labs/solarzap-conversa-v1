import { Clock3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TokenBadge, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmTask } from '@/modules/internal-crm/types';

type NextActionsPanelProps = {
  tasks: InternalCrmTask[];
};

export function NextActionsPanel(props: NextActionsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock3 className="h-4 w-4 text-primary" />
          Próximas ações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma ação pendente.</p>
        ) : (
          props.tasks.map((task) => (
            <div key={task.id} className="rounded-xl border border-border/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{task.title}</p>
                <TokenBadge token={task.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Prazo: {formatDateTime(task.due_at)}</p>
              {task.notes ? <p className="mt-1 text-sm text-muted-foreground">{task.notes}</p> : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
