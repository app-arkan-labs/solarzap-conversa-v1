import { Archive, Calendar, CalendarClock, CheckCheck, ClipboardList, Kanban, MessageSquare, Phone, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import type {
  InternalCrmClientDetail,
  InternalCrmConversationSummary,
} from '@/modules/internal-crm/types';

type InternalCrmActionsPanelProps = {
  conversation: InternalCrmConversationSummary | null;
  detail: InternalCrmClientDetail | null;
  onUpdateStatus: (status: 'open' | 'resolved' | 'archived') => void;
  onScheduleMeeting: () => void;
  onOpenComments: () => void;
  onNavigatePipeline: () => void;
  isUpdatingStatus?: boolean;
};

function normalizeAppointments(detail: InternalCrmClientDetail | null) {
  return (detail?.appointments || []).map((appointment, index) => {
    const r = appointment as Record<string, unknown>;
    return {
      id: String(r.id || `apt-${index}`),
      title: String(r.title || 'Compromisso'),
      status: String(r.status || 'scheduled'),
      startAt: typeof r.start_at === 'string' ? r.start_at : null,
    };
  });
}

export function InternalCrmActionsPanel(props: InternalCrmActionsPanelProps) {
  const detail = props.detail;
  const openTasks = (detail?.tasks || []).filter((t) => t.status === 'open');
  const appointments = normalizeAppointments(detail);
  const client = detail?.client;
  const isResolved = props.conversation?.status === 'resolved';
  const isArchived = props.conversation?.status === 'archived';

  const quickActions = [
    {
      id: 'call',
      label: 'Ligar',
      icon: Phone,
      className: 'bg-blue-500 hover:bg-blue-600 text-white',
      onClick: () => {
        const phone = client?.primary_phone || props.conversation?.primary_phone;
        if (phone) window.open(`tel:${phone}`);
      },
    },
    {
      id: 'video',
      label: 'Vídeo',
      icon: Video,
      className: 'bg-cyan-500 hover:bg-cyan-600 text-white',
      onClick: () => {},
    },
    {
      id: 'schedule',
      label: 'Reunião',
      icon: Calendar,
      className: 'bg-purple-500 hover:bg-purple-600 text-white',
      onClick: props.onScheduleMeeting,
    },
    {
      id: 'comments',
      label: 'Notas',
      icon: MessageSquare,
      className: 'bg-secondary hover:bg-secondary/80 text-secondary-foreground',
      onClick: props.onOpenComments,
    },
    {
      id: 'pipeline',
      label: 'Pipeline',
      icon: Kanban,
      className: 'bg-indigo-500 hover:bg-indigo-600 text-white',
      onClick: props.onNavigatePipeline,
    },
    {
      id: 'resolve',
      label: isResolved || isArchived ? 'Reabrir' : 'Resolver',
      icon: isResolved || isArchived ? CheckCheck : isArchived ? Archive : CheckCheck,
      className: isResolved || isArchived ? 'bg-sky-500 hover:bg-sky-600 text-white' : 'bg-emerald-500 hover:bg-emerald-600 text-white',
      onClick: () => props.onUpdateStatus(isResolved || isArchived ? 'open' : 'resolved'),
    },
  ];

  if (!props.conversation) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Selecione uma conversa.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/40 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Painel de Ações</p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0">
          {/* Quick Actions */}
          <section className="border-b border-border/40 p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Ações Rápidas</p>
            <div className="grid grid-cols-3 gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.id}
                    variant="secondary"
                    size="sm"
                    className={`h-auto flex-col gap-1 py-2.5 text-[11px] font-medium ${action.className}`}
                    onClick={action.onClick}
                    disabled={action.id === 'resolve' && props.isUpdatingStatus}
                  >
                    <Icon className="h-4 w-4" />
                    {action.label}
                  </Button>
                );
              })}
            </div>
          </section>

          {/* Client Summary */}
          <section className="border-b border-border/40 p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Resumo do Cliente</p>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Nome:</span> {client?.company_name || props.conversation.client_company_name || '-'}</p>
              <p><span className="text-muted-foreground">Contato:</span> {client?.primary_contact_name || props.conversation.primary_contact_name || '-'}</p>
              <p><span className="text-muted-foreground">Telefone:</span> {client?.primary_phone || props.conversation.primary_phone || '-'}</p>
              <p><span className="text-muted-foreground">Email:</span> {client?.primary_email || props.conversation.primary_email || '-'}</p>
              {client?.notes ? (
                <p className="text-xs text-muted-foreground mt-2 italic">{client.notes}</p>
              ) : null}
            </div>
          </section>

          {/* Tasks */}
          <section className="border-b border-border/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-semibold text-muted-foreground">Tarefas</p>
            </div>
            {openTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem tarefas abertas.</p>
            ) : (
              <div className="space-y-2">
                {openTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs">
                    <p className="font-medium text-foreground">{task.title}</p>
                    {task.due_at ? <p className="mt-0.5 text-muted-foreground">{formatDateTime(task.due_at)}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Calendar */}
          <section className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-semibold text-muted-foreground">Agenda</p>
            </div>
            {appointments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum compromisso agendado.</p>
            ) : (
              <div className="space-y-2">
                {appointments.slice(0, 4).map((apt) => (
                  <div key={apt.id} className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs">
                    <p className="font-medium text-foreground">{apt.title}</p>
                    {apt.startAt ? <p className="mt-0.5 text-muted-foreground">{formatDateTime(apt.startAt)}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
