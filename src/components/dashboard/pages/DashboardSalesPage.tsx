import { AlertTriangle, ArrowRightLeft, CheckCircle2, Clock3, TimerReset } from "lucide-react";

import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { DashboardMetricGrid, type DashboardMetricItem } from "@/components/dashboard/DashboardMetricGrid";
import { FunnelOverview } from "@/components/dashboard/FunnelOverview";
import { SourcePerformanceCard } from "@/components/dashboard/SourcePerformanceCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaleLeadsTable } from "@/components/dashboard/tables/StaleLeadsTable";
import type { DashboardPayload } from "@/types/dashboard";

interface DashboardSalesPageProps {
  data?: DashboardPayload;
  isLoading: boolean;
  onViewPipeline?: () => void;
  onOpenLead?: (leadId: string | number) => void;
}

export function DashboardSalesPage({
  data,
  isLoading,
  onViewPipeline,
  onOpenLead,
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

      <div className="min-w-0">
        <DashboardCharts data={data?.charts} kpis={data?.kpis} isLoading={isLoading} mode="commercial" />
      </div>

      <Card className="border-border/50 bg-background/50 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-amber-600" />
            Leads para retomar
          </CardTitle>
          <CardDescription>Negociacoes paradas que merecem contato rapido para nao perder timing.</CardDescription>
        </CardHeader>
        <CardContent>
          <StaleLeadsTable
            data={data?.tables.stale_leads}
            isLoading={isLoading}
            onOpenLead={onOpenLead}
            maxHeightClassName="h-[460px]"
          />
        </CardContent>
      </Card>
    </div>
  );
}
