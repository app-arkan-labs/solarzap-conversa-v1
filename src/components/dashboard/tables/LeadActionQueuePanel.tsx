import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Clock3, ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadNextActionBadge } from "@/components/solarzap/LeadNextActionBadge";
import { PIPELINE_STAGES, type Contact, type LeadTask } from "@/types/solarzap";
import { buildLeadActionMaps, getLastActionText, getLeadTaskDueState } from "@/lib/leadNextActions";

interface LeadActionQueuePanelProps {
  contacts: Contact[];
  tasks: LeadTask[];
  isLoading?: boolean;
  teamMode?: boolean;
  onOpenLead?: (contactId: string) => void;
  onViewConversations?: () => void;
}

export function LeadActionQueuePanel({
  contacts,
  tasks,
  isLoading = false,
  teamMode = false,
  onOpenLead,
  onViewConversations,
}: LeadActionQueuePanelProps) {
  const { nextActionByLeadId, lastActionByLeadId } = useMemo(() => buildLeadActionMaps(tasks), [tasks]);

  const queueSummary = useMemo(
    () =>
      contacts.reduce(
        (acc, contact) => {
          const task = nextActionByLeadId.get(String(contact.id)) || null;
          const dueState = getLeadTaskDueState(task);
          if (dueState === "overdue") acc.overdue += 1;
          if (dueState === "today") acc.today += 1;
          if (dueState === "upcoming") acc.upcoming += 1;
          if (dueState === "none") acc.none += 1;
          return acc;
        },
        { overdue: 0, today: 0, upcoming: 0, none: 0 },
      ),
    [contacts, nextActionByLeadId],
  );

  const priorityRows = useMemo(() => {
    return contacts
      .map((contact) => {
        const nextAction = nextActionByLeadId.get(String(contact.id)) || null;
        const lastAction = lastActionByLeadId.get(String(contact.id)) || null;
        const dueState = getLeadTaskDueState(nextAction);
        return { contact, nextAction, lastAction, dueState };
      })
      .filter((row) => row.dueState === "overdue" || row.dueState === "today")
      .sort((left, right) => {
        const leftRank = left.dueState === "overdue" ? 0 : 1;
        const rightRank = right.dueState === "overdue" ? 0 : 1;
        if (leftRank !== rightRank) return leftRank - rightRank;

        const leftDue = left.nextAction?.dueAt ? new Date(left.nextAction.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDue = right.nextAction?.dueAt ? new Date(right.nextAction.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        return leftDue - rightDue;
      });
  }, [contacts, lastActionByLeadId, nextActionByLeadId]);

  const noActionRows = useMemo(() => {
    return contacts
      .filter((contact) => !nextActionByLeadId.get(String(contact.id)))
      .slice(0, 8);
  }, [contacts, nextActionByLeadId]);

  const title = teamMode ? "Fila do time" : "Minha fila de hoje";
  const description = teamMode
    ? "Leitura operacional consolidada para priorizar o time respeitando o escopo atual."
    : "Priorize os leads vencidos e de hoje sem sair do contexto comercial.";

  if (isLoading) {
    return null;
  }

  return (
    <Card className="border-border/50 bg-background/50 shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <ListTodo className="h-5 w-5 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>

          {onViewConversations ? (
            <Button variant="outline" className="gap-2" onClick={onViewConversations}>
              Ver Conversas
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700">
            <AlertTriangle className="h-3 w-3" />
            {queueSummary.overdue} vencidas
          </Badge>
          <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
            <Clock3 className="h-3 w-3" />
            {queueSummary.today} hoje
          </Badge>
          <Badge variant="outline">{queueSummary.upcoming} proximas</Badge>
          <Badge variant="outline">{queueSummary.none} sem proxima acao</Badge>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Prioridade do dia</p>
            <p className="text-xs text-muted-foreground">Vencidas e previstas para hoje.</p>
          </div>

          {priorityRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              Nenhuma proxima acao vencida ou programada para hoje neste escopo.
            </div>
          ) : (
            priorityRows.slice(0, 8).map((row) => {
              const stage = PIPELINE_STAGES[row.contact.pipelineStage];
              const content = (
                <div className="w-full rounded-xl border border-border/70 bg-card/80 px-4 py-3 text-left transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{row.contact.name}</p>
                        <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                          {stage.icon} {stage.title}
                        </Badge>
                      </div>
                      <p className="truncate text-sm text-foreground">{row.nextAction?.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Ultima acao: {getLastActionText(row.lastAction)}
                      </p>
                    </div>
                    <LeadNextActionBadge task={row.nextAction} />
                  </div>
                </div>
              );

              if (!onOpenLead) {
                return <div key={row.contact.id}>{content}</div>;
              }

              return (
                <button key={row.contact.id} type="button" className="w-full" onClick={() => onOpenLead(row.contact.id)}>
                  {content}
                </button>
              );
            })
          )}
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Leads sem proxima acao</p>
            <p className="text-xs text-muted-foreground">Buracos operacionais que precisam de dono e prazo.</p>
          </div>

          {noActionRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              Nenhum lead sem proxima acao neste escopo.
            </div>
          ) : (
            noActionRows.map((contact) => {
              const stage = PIPELINE_STAGES[contact.pipelineStage];
              const content = (
                <div className="w-full rounded-xl border border-border/70 bg-card/80 px-4 py-3 text-left transition-colors hover:border-primary/40">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-semibold text-foreground">{contact.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Etapa atual: {stage.title}
                      </p>
                    </div>
                    <LeadNextActionBadge task={null} showEmpty />
                  </div>
                </div>
              );

              if (!onOpenLead) {
                return <div key={contact.id}>{content}</div>;
              }

              return (
                <button key={contact.id} type="button" className="w-full" onClick={() => onOpenLead(contact.id)}>
                  {content}
                </button>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
