import { AlertTriangle, ArrowRightLeft, CheckCircle2, Clock3, RadioTower, TimerReset } from "lucide-react";

import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { DashboardMetricGrid, type DashboardMetricItem } from "@/components/dashboard/DashboardMetricGrid";
import { FunnelOverview } from "@/components/dashboard/FunnelOverview";
import { SourcePerformanceCard } from "@/components/dashboard/SourcePerformanceCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaleLeadsTable } from "@/components/dashboard/tables/StaleLeadsTable";
import type { DashboardPayload } from "@/types/dashboard";

interface DashboardSalesPageProps {
  data?: DashboardPayload;
  isLoading: boolean;
  onViewPipeline?: () => void;
  onViewConversations?: () => void;
}

export function DashboardSalesPage({
  data,
  isLoading,
  onViewPipeline,
  onViewConversations,
}: DashboardSalesPageProps) {
  const metrics: DashboardMetricItem[] = data?.funnel
    ? [
        {
          id: "sales-active",
          label: "Leads em andamento",
          value: String(data.funnel.active),
          description: "Leads ainda em processo comercial.",
          icon: TimerReset,
          tone: "sky",
        },
        {
          id: "sales-moved",
          label: "Mudancas de etapa",
          value: String(data.funnel.moved_in_period),
          description: "Movimentacoes de etapa no periodo.",
          icon: ArrowRightLeft,
          tone: "cyan",
        },
        {
          id: "sales-won",
          label: "Vendas fechadas",
          value: String(data.funnel.won_in_period),
          description: "Negocios ganhos no periodo.",
          icon: CheckCircle2,
          tone: "emerald",
        },
        {
          id: "sales-stale",
          label: "Precisam de atencao",
          value: String(data.funnel.stale_total),
          description: "Leads parados alem do tempo ideal.",
          icon: AlertTriangle,
          tone: "amber",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <DashboardMetricGrid items={metrics} />

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="min-w-0">
          <FunnelOverview data={data?.funnel} isLoading={isLoading} onViewPipeline={onViewPipeline} />
        </div>
        <div className="min-w-0">
          <SourcePerformanceCard
            data={data?.source_performance}
            revenueBasis={data?.kpis.revenue.basis}
            isLoading={isLoading}
            limit={5}
            actionLabel="Ver leads"
            onAction={onViewPipeline}
          />
        </div>
      </div>

      <DashboardCharts data={data?.charts} kpis={data?.kpis} isLoading={isLoading} mode="commercial" />

      <Card className="border-border/50 bg-background/50 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-amber-600" />
              Leads que precisam de atencao
            </CardTitle>
            <CardDescription>Leads parados e sem andamento que merecem retorno antes de perder a venda.</CardDescription>
          </div>
          {onViewConversations ? (
            <Button variant="outline" size="sm" className="rounded-full" onClick={onViewConversations}>
              Ver leads
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <StaleLeadsTable data={data?.tables.stale_leads} isLoading={isLoading} />
        </CardContent>
      </Card>

      {data?.source_performance?.length ? (
        <Card className="border-border/50 bg-background/50 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RadioTower className="h-4 w-4 text-sky-600" />
              Onde agir primeiro
            </CardTitle>
            <CardDescription>
              Cruze volume de leads com venda fechada para decidir onde vale insistir, ajustar abordagem ou rever investimento.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.source_performance.slice(0, 3).map((row) => (
              <div key={row.source} className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">{row.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.leads} leads | {row.won} vendas | {row.conversion_pct.toFixed(1)}% de conversao
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
