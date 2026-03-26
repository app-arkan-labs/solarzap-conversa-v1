import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPayload } from "@/types/dashboard";
import { AlertTriangle, ArrowRightLeft, CheckCircle2, TimerReset } from "lucide-react";

interface FunnelOverviewProps {
  data?: DashboardPayload["funnel"];
  isLoading: boolean;
}

const BUSINESS_GROUP_LABELS = {
  topo: "Entrada",
  meio: "Contato e visita",
  fundo: "Proposta e fechamento",
  saida: "Saidas",
} as const;

export function FunnelOverview({ data, isLoading }: FunnelOverviewProps) {
  if (isLoading || !data) return null;

  const bottleneckLabel = data.top_bottleneck_stage
    ? data.by_stage.find((row) => row.stage === data.top_bottleneck_stage)?.label || "Sem gargalo"
    : "Sem fila critica";

  const priorityRows = [...data.by_stage]
    .filter((row) => row.group !== "saida" && (row.count > 0 || row.entered_in_period > 0))
    .sort((left, right) => right.stale_count - left.stale_count || right.count - left.count || right.entered_in_period - left.entered_in_period);

  const visibleRows = priorityRows.slice(0, 4);
  const remainingRows = priorityRows.slice(4);

  return (
    <Card className="border-border/50 bg-background/50 shadow-sm">
      <CardHeader>
        <CardTitle>Carteira por etapa</CardTitle>
        <CardDescription>Veja onde os leads estao, onde travam e o que pede atencao agora.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <TimerReset className="h-4 w-4 text-sky-600" />
              Leads em andamento
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{data.active}</p>
            <p className="mt-1 text-xs text-muted-foreground">Leads ainda em processo comercial.</p>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ArrowRightLeft className="h-4 w-4 text-sky-600" />
              Leads que avancaram
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{data.moved_in_period}</p>
            <p className="mt-1 text-xs text-muted-foreground">Mudancas de etapa no periodo.</p>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Vendas fechadas
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{data.won_in_period}</p>
            <p className="mt-1 text-xs text-muted-foreground">Negocios ganhos neste periodo.</p>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Pedem atencao
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{data.stale_total}</p>
            <p className="mt-1 text-xs text-muted-foreground">{bottleneckLabel}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {data.by_group.map((group) => (
            <div key={group.key} className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {BUSINESS_GROUP_LABELS[group.key]}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{group.count}</p>
                </div>
                <Badge variant="secondary" className="bg-muted/80 text-muted-foreground">
                  {group.pct.toFixed(0)}%
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {group.stale_count > 0 ? `${group.stale_count} parados alem do tempo ideal` : "Sem fila critica agora"}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Etapas que pedem atencao</p>
              <p className="text-xs text-muted-foreground">Foco nas etapas com mais volume ou atraso.</p>
            </div>
            {priorityRows.length > 0 ? <span className="text-xs text-muted-foreground">{priorityRows.length} etapas com leitura ativa</span> : null}
          </div>

          {visibleRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
              Sem etapas relevantes para exibir neste periodo.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleRows.map((row) => (
                <div key={row.stage} className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{row.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.entered_in_period} entradas no periodo
                        {row.sla_days ? ` | tempo ideal: ${row.sla_days} dias` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <Badge variant="secondary" className="bg-muted/80 text-muted-foreground">
                        {row.count} na etapa
                      </Badge>
                      {row.stale_count > 0 ? (
                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-700">
                          {row.stale_count} parados
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700">
                          fluxo em dia
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {remainingRows.length > 0 ? (
          <Accordion type="single" collapsible className="rounded-xl border border-border/60 bg-background/70 px-4">
            <AccordionItem value="all-stages" className="border-b-0">
              <AccordionTrigger className="py-3 text-sm text-foreground hover:no-underline">
                Ver todas as etapas
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                {remainingRows.map((row) => (
                  <div key={row.stage} className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{row.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.entered_in_period} entradas
                        {row.sla_days ? ` | tempo ideal: ${row.sla_days} dias` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="bg-muted/80 text-muted-foreground">
                        {row.count} na etapa
                      </Badge>
                      {row.stale_count > 0 ? (
                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-700">
                          {row.stale_count} parados
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
      </CardContent>
    </Card>
  );
}
