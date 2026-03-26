import { useMemo, useState } from 'react';
import { CalendarPlus2, CheckCircle2, Clock3, Pencil, Plus, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Contact, LeadTask } from '@/types/solarzap';
import {
  LEAD_NEXT_ACTION_SUGGESTIONS,
  LEAD_TASK_CHANNEL_LABELS,
  LEAD_TASK_PRIORITY_LABELS,
  formatLeadTaskDueLabel,
  formatLeadTaskTimestamp,
  getLastActionText,
} from '@/lib/leadNextActions';
import { LeadNextActionBadge } from './LeadNextActionBadge';
import { LeadNextActionDialog } from './LeadNextActionDialog';
import { useToast } from '@/hooks/use-toast';

type LeadNextActionSectionProps = {
  enabled?: boolean;
  contact: Contact;
  nextAction: LeadTask | null;
  lastAction: LeadTask | null;
  history?: LeadTask[];
  isLoading?: boolean;
  compact?: boolean;
  onCreate: (input: {
    leadId: number;
    title: string;
    notes?: string | null;
    dueAt?: Date | null;
    priority?: LeadTask['priority'];
    channel?: LeadTask['channel'];
    userId?: string | null;
  }) => Promise<void>;
  onUpdate: (input: {
    taskId: string;
    title?: string;
    notes?: string | null;
    dueAt?: Date | null;
    priority?: LeadTask['priority'];
    channel?: LeadTask['channel'];
    userId?: string | null;
  }) => Promise<void>;
  onComplete: (task: LeadTask, resultSummary: string) => Promise<void>;
  onCancel: (taskId: string) => Promise<void>;
  onScheduleAppointment?: (task: LeadTask) => void;
};

export function LeadNextActionSection({
  enabled = false,
  contact,
  nextAction,
  lastAction,
  history = [],
  isLoading = false,
  compact = false,
  onCreate,
  onUpdate,
  onComplete,
  onCancel,
  onScheduleAppointment,
}: LeadNextActionSectionProps) {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const suggestion = useMemo(
    () => LEAD_NEXT_ACTION_SUGGESTIONS[contact.pipelineStage] || 'Definir proxima acao',
    [contact.pipelineStage],
  );
  const visibleHistory = useMemo(
    () =>
      history
        .filter((task) => task.id !== nextAction?.id)
        .slice(0, 4),
    [history, nextAction?.id],
  );

  if (!enabled) return null;

  const handleCancel = async () => {
    if (!nextAction) return;
    if (!window.confirm('Cancelar a proxima acao ativa deste lead?')) return;
    try {
      setIsCancelling(true);
      await onCancel(nextAction.id);
      toast({
        title: 'Proxima acao cancelada',
        description: `A acao de ${contact.name} foi cancelada.`,
      });
    } catch (error) {
      toast({
        title: 'Erro ao cancelar acao',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const contentClassName = compact
    ? 'rounded-lg border border-border/60 bg-background/70 px-3 py-2 shadow-sm'
    : 'rounded-xl border border-border/60 bg-muted/15 p-3 shadow-sm';

  const lastActionText = getLastActionText(lastAction);
  const lastActionAt = formatLeadTaskTimestamp(lastAction?.completedAt || lastAction?.updatedAt || null);
  const nextDueLabel = formatLeadTaskDueLabel(nextAction);

  if (compact) {
    return (
      <>
        <div className={contentClassName}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Proxima acao
                </p>
                <LeadNextActionBadge task={nextAction} showEmpty={Boolean(nextAction)} />
              </div>
              <p className="mt-1 truncate text-sm font-medium text-foreground">
                {nextAction ? nextAction.title : 'Sem proxima acao definida'}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {nextAction
                  ? `${nextDueLabel} • Ultima: ${lastActionText}`
                  : `Ultima: ${lastActionText}`}
              </p>
            </div>

            <Button
              size="sm"
              variant={nextAction ? 'outline' : 'default'}
              className="h-7 rounded-full px-3 text-[11px]"
              onClick={() => (nextAction ? setEditOpen(true) : setCreateOpen(true))}
            >
              {nextAction ? 'Gerir' : 'Definir'}
            </Button>
          </div>
        </div>

        <LeadNextActionDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode="create"
          contact={contact}
          onCreate={onCreate}
        />

        <LeadNextActionDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          mode="edit"
          contact={contact}
          action={nextAction}
          onUpdate={onUpdate}
        />

        <LeadNextActionDialog
          open={completeOpen}
          onOpenChange={setCompleteOpen}
          mode="complete"
          contact={contact}
          action={nextAction}
          onComplete={onComplete}
        />
      </>
    );
  }

  return (
    <>
      <div className={cn(contentClassName, 'space-y-3')}>
        <div className="rounded-lg border border-border/60 bg-background/65 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Proxima acao
              </p>
              <p className="text-sm font-medium leading-5 text-foreground">
                {nextAction ? nextAction.title : 'Sem proxima acao definida'}
              </p>
              {nextAction?.notes ? (
                <p className="text-xs leading-4 text-muted-foreground">{nextAction.notes}</p>
              ) : !nextAction ? (
                <p className="text-xs leading-4 text-muted-foreground">Sugestao da etapa: {suggestion}</p>
              ) : null}
            </div>
            <LeadNextActionBadge task={nextAction} showEmpty className="shrink-0" />
          </div>

          {nextAction ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/25 px-2 py-1">
                <Clock3 className="h-3 w-3" />
                {nextDueLabel}
              </span>
              <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px]">
                {LEAD_TASK_PRIORITY_LABELS[nextAction.priority]}
              </Badge>
              {nextAction.channel ? (
                <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px]">
                  {LEAD_TASK_CHANNEL_LABELS[nextAction.channel]}
                </Badge>
              ) : null}
              {nextAction.linkedAppointmentId ? (
                <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px]">
                  Evento vinculado
                </Badge>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {nextAction ? (
              <>
                <Button size="sm" className="h-8 rounded-full gap-1.5" onClick={() => setCompleteOpen(true)}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Concluir
                </Button>
                <Button size="sm" variant="outline" className="h-8 rounded-full gap-1.5" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
                {onScheduleAppointment ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full gap-1.5"
                    onClick={() => onScheduleAppointment(nextAction)}
                  >
                    <CalendarPlus2 className="h-3.5 w-3.5" />
                    {nextAction.linkedAppointmentId ? 'Reagendar evento' : 'Agendar evento'}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-full gap-1.5 text-muted-foreground"
                  disabled={isCancelling}
                  onClick={() => {
                    void handleCancel();
                  }}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancelar
                </Button>
              </>
            ) : (
              <Button size="sm" className="h-8 rounded-full gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Definir proxima
              </Button>
            )}
            {isLoading ? <span className="self-center text-xs text-muted-foreground">Atualizando...</span> : null}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Ultima acao
            </p>
            {lastActionAt ? <span className="text-[11px] text-muted-foreground">{lastActionAt}</span> : null}
          </div>
          <p className="mt-1 text-sm leading-5 text-foreground">{lastActionText}</p>
        </div>

        {visibleHistory.length > 0 ? (
          <div className="space-y-2 border-t border-border/60 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Historico recente
            </p>
            <div className="space-y-2">
              {visibleHistory.map((task) => {
                const historyAt = formatLeadTaskTimestamp(task.completedAt || task.updatedAt || task.createdAt);
                const historyText = getLastActionText(task);

                return (
                  <div key={task.id} className="rounded-lg border border-border/60 bg-background/55 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-xs font-medium leading-4 text-foreground">{historyText}</p>
                      <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px]">
                        {task.status === 'canceled' ? 'Cancelada' : 'Concluida'}
                      </Badge>
                    </div>
                    {historyAt ? <p className="mt-1 text-[11px] text-muted-foreground">{historyAt}</p> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <LeadNextActionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        contact={contact}
        onCreate={onCreate}
      />

      <LeadNextActionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        contact={contact}
        action={nextAction}
        onUpdate={onUpdate}
      />

      <LeadNextActionDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        mode="complete"
        contact={contact}
        action={nextAction}
        onComplete={onComplete}
      />
    </>
  );
}
