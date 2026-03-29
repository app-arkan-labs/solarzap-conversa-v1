import { Clock3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TokenBadge, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmClientDetail } from '@/modules/internal-crm/types';

type InternalCrmClientTimelineProps = {
  detail: InternalCrmClientDetail;
};

type TimelineEntry = {
  id: string;
  date: string | null;
  title: string;
  description: string;
  token: string;
};

export function InternalCrmClientTimeline(props: InternalCrmClientTimelineProps) {
  const entries: TimelineEntry[] = [
    ...props.detail.deals.map((deal) => ({
      id: `deal-${deal.id}`,
      date: deal.updated_at,
      title: `Deal: ${deal.title}`,
      description: `Status ${deal.status} · Etapa ${deal.stage_code || '-'}`,
      token: deal.status,
    })),
    ...props.detail.tasks.map((task) => ({
      id: `task-${task.id}`,
      date: task.due_at,
      title: `Tarefa: ${task.title}`,
      description: task.notes || 'Sem descrição adicional',
      token: task.status,
    })),
    ...props.detail.appointments.map((appointment, index) => ({
      id: `appointment-${index}`,
      date: String(appointment.start_at || appointment.updated_at || ''),
      title: `Evento: ${String(appointment.title || 'Compromisso')}`,
      description: `Status ${String(appointment.status || '-')}`,
      token: String(appointment.status || 'open'),
    })),
  ]
    .sort((left, right) => {
      const leftTime = left.date ? new Date(left.date).getTime() : 0;
      const rightTime = right.date ? new Date(right.date).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, 20);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock3 className="h-4 w-4 text-primary" />
          Timeline comercial
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem eventos registrados para este cliente.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-border/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{entry.title}</p>
                <TokenBadge token={entry.token} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{entry.description}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(entry.date)}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
