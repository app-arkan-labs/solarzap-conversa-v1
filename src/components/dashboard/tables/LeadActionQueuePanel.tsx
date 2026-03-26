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

  const noActionRows = useMemo(
    () =>
      contacts
        .filter((contact) => !nextActionByLeadId.get(String(contact.id)))
        .slice(0, 3),
    [contacts, nextActionByLeadId],
  );

  const title = teamMode ? "Fila operacional do time" : "Fila operacional";
  const description = teamMode
    ? "Resumo rapido para priorizar o time sem inflar a dashboard."
    : "Leitura compacta das prioridades do dia para voltar a agir em Conversas.";

  if (isLoading) {
    return null;
  }

  return (
    <Card className="border-border/50 bg-background/50 shadow-sm">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ListTodo className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>

          {onViewConversations ? (
            <Button variant="outline" size="sm" className="gap-2 rounded-full" onClick={onViewConversations}>
              Abrir em Conversas
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1 rounded-full border-red-500/25 bg-red-500/10 text-red-200">
            <AlertTriangle className="h-3 w-3" />
            {queueSummary.overdue} vencidas
          </Badge>
          <Badge variant="outline" className="gap-1 rounded-full border-amber-500/25 bg-amber-500/10 text-amber-200">
            <Clock3 className="h-3 w-3" />
            {queueSummary.today} hoje
          </Badge>
          <Badge variant="outline" className="rounded-full border-border/70 bg-muted/20">
            {queueSummary.upcoming} proximas
          </Badge>
          <Badge variant="outline" className="rounded-full border-border/70 bg-muted/20">
            {queueSummary.none} sem acao
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Prioridade imediata</p>
              <p className="text-xs text-muted-foreground">Leads vencidos e previstos para hoje.</p>
            </div>
            {priorityRows.length > 0 ? (
              <span className="text-xs text-muted-foreground">{Math.min(priorityRows.length, 5)} itens</span>
            ) : null}
          </div>

          {priorityRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
              Nenhuma prioridade imediata neste escopo.
            </div>
          ) : (
            priorityRows.slice(0, 5).map((row) => {
              const stage = PIPELINE_STAGES[row.contact.pipelineStage];
              const content = (
                <div className="w-full rounded-lg border border-border/60 bg-card/60 px-3 py-2.5 text-left transition-colors hover:border-primary/35">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-semibold text-foreground">{row.contact.name}</p>
                      <p className="truncate text-sm text-foreground">{row.nextAction?.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {stage.title} • Ultima: {getLastActionText(row.lastAction)}
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

        <div className="rounded-lg border border-border/60 bg-muted/15 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Sem proxima acao
              </p>
              <p className="text-2xl font-semibold text-foreground">{queueSummary.none}</p>
              <p className="text-xs text-muted-foreground">
                {queueSummary.none > 0
                  ? "Leads ainda sem dono operacional ou prazo definido."
                  : "Todos os leads deste escopo ja tem um proximo passo."}
              </p>
            </div>
            {queueSummary.none > 0 ? <LeadNextActionBadge task={null} showEmpty /> : null}
          </div>

          {noActionRows.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {noActionRows.map((contact) => {
                const chip = (
                  <span className="inline-flex max-w-full items-center rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-[11px] text-muted-foreground">
                    <span className="truncate">{contact.name}</span>
                  </span>
                );

                if (!onOpenLead) {
                  return <div key={contact.id}>{chip}</div>;
                }

                return (
                  <button key={contact.id} type="button" onClick={() => onOpenLead(contact.id)}>
                    {chip}
                  </button>
                );
              })}
              {queueSummary.none > noActionRows.length ? (
                <span className="inline-flex items-center rounded-full border border-border/60 bg-background/35 px-2.5 py-1 text-[11px] text-muted-foreground">
                  +{queueSummary.none - noActionRows.length} restantes
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
