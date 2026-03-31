import { Clock3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmClientDetail } from '@/modules/internal-crm/types';

const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  done: 'Concluído',
  won: 'Fechou',
  lost: 'Não Fechou',
  canceled: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'text-blue-600 bg-blue-50 border-blue-200',
  done: 'text-green-600 bg-green-50 border-green-200',
  won: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  lost: 'text-red-600 bg-red-50 border-red-200',
  canceled: 'text-gray-500 bg-gray-50 border-gray-200',
};

type InternalCrmClientTimelineProps = {
  detail: InternalCrmClientDetail;
};

type TimelineEntry = {
  id: string;
  date: string | null;
  title: string;
  description: string;
  status: string;
};

export function InternalCrmClientTimeline(props: InternalCrmClientTimelineProps) {
  const entries: TimelineEntry[] = [
    ...props.detail.deals.map((deal) => ({
      id: `deal-${deal.id}`,
      date: deal.updated_at,
      title: `Negociação: ${deal.title}`,
      description: `${STATUS_LABELS[deal.status] || deal.status} · Etapa ${deal.stage_code || '-'}`,
      status: deal.status,
    })),
    ...props.detail.tasks.map((task) => ({
      id: `task-${task.id}`,
      date: task.due_at,
      title: `Tarefa: ${task.title}`,
      description: task.notes || 'Sem descrição adicional',
      status: task.status,
    })),
    ...props.detail.appointments.map((appointment, index) => ({
      id: `appointment-${index}`,
      date: String(appointment.start_at || appointment.updated_at || ''),
      title: `Evento: ${String(appointment.title || 'Compromisso')}`,
      description: `${STATUS_LABELS[String(appointment.status || '')] || String(appointment.status || '-')}`,
      status: String(appointment.status || 'open'),
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
          Timeline
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
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[entry.status] || 'text-muted-foreground bg-muted border-border'}`}
                >
                  {STATUS_LABELS[entry.status] || entry.status}
                </span>
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
