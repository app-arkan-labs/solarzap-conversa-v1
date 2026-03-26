import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PIPELINE_STAGES } from "@/types/solarzap";
import { DashboardPayload } from "@/types/dashboard";
import { AlertTriangle, ArrowRight, Clock3 } from "lucide-react";

interface ActionSnapshotCardProps {
  funnel?: DashboardPayload["funnel"];
  staleLeads?: DashboardPayload["tables"]["stale_leads"];
  onOpenLead?: (leadName: string) => void;
  onViewConversations?: () => void;
  teamMode?: boolean;
}

export function ActionSnapshotCard({
  funnel,
  staleLeads,
  onOpenLead,
  onViewConversations,
  teamMode = false,
}: ActionSnapshotCardProps) {
  const items = (staleLeads || []).slice(0, 4);
  const priorityTitle = teamMode ? "Prioridades do time" : "O que agir hoje";

  return (
    <Card className="border-border/50 bg-background/50 shadow-sm">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock3 className="h-4 w-4 text-primary" />
              {priorityTitle}
            </CardTitle>
            <CardDescription>Leads que merecem retorno ou desbloqueio antes de esfriar.</CardDescription>
          </div>

          {onViewConversations ? (
            <Button variant="outline" size="sm" className="gap-2 rounded-full" onClick={onViewConversations}>
              Abrir em Conversas
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Leads parados</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{staleLeads?.length || 0}</p>
            <p className="mt-1 text-xs text-muted-foreground">Alem de 7 dias sem avancar de etapa.</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Leads em andamento</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{funnel?.active || 0}</p>
            <p className="mt-1 text-xs text-muted-foreground">Carteira ainda em processo comercial.</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Etapa que trava
            </div>
            <p className="mt-2 text-base font-semibold text-foreground">
              {funnel?.top_bottleneck_stage
                ? funnel.by_stage.find((row) => row.stage === funnel.top_bottleneck_stage)?.label || "Sem fila critica"
                : "Sem fila critica"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Onde ha mais acumulacao ou atraso agora.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Leads que pedem retorno</p>
            <p className="text-xs text-muted-foreground">Use este bloco como ponto de partida da rotina comercial.</p>
          </div>

          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
              Nenhum lead critico neste escopo.
            </div>
          ) : (
            items.map((lead) => {
              const stageLabel = PIPELINE_STAGES[lead.stage as keyof typeof PIPELINE_STAGES]?.title || lead.stage;
              const content = (
                <div className="w-full rounded-lg border border-border/60 bg-card/60 px-3 py-3 text-left transition-colors hover:border-primary/35">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{lead.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{lead.days_stale} dias parados | {stageLabel}</p>
                    </div>
                    <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-700">
                      prioridade
                    </span>
                  </div>
                </div>
              );

              if (!onOpenLead) {
                return <div key={lead.id}>{content}</div>;
              }

              return (
                <button key={lead.id} type="button" className="w-full" onClick={() => onOpenLead(lead.name)}>
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
