import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Wallet } from "lucide-react";

import { ActionSnapshotCard } from "@/components/dashboard/ActionSnapshotCard";
import { DashboardMetricGrid, type DashboardMetricItem } from "@/components/dashboard/DashboardMetricGrid";
import { FinanceSnapshotCard } from "@/components/dashboard/FinanceSnapshotCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarSummaryPanel } from "@/components/dashboard/tables/CalendarSummaryPanel";
import { LeadActionQueuePanel } from "@/components/dashboard/tables/LeadActionQueuePanel";
import { StaleLeadsTable } from "@/components/dashboard/tables/StaleLeadsTable";
import type { DashboardPayload } from "@/types/dashboard";
import type { Contact, LeadTask } from "@/types/solarzap";

interface DashboardTodayPageProps {
  data?: DashboardPayload;
  isLoading: boolean;
  contacts: Contact[];
  leadTasks: LeadTask[];
  showLeadNextAction: boolean;
  teamMode: boolean;
  onOpenLeadContact: (contactId: string) => void;
  onOpenLeadById: (leadId: string | number) => void;
  onReviewInstallment?: (installment: DashboardPayload["finance"]["upcoming_installments"][number]) => void;
  onViewConversations?: () => void;
  onViewCalendar?: () => void;
  onViewSales?: () => void;
}

function TodayBottleneckCard({
  funnel,
  onViewSales,
}: {
  funnel?: DashboardPayload["funnel"];
  onViewSales?: () => void;
}) {
  if (!funnel) return null;

  const bottleneckRows = [...funnel.by_stage]
    .filter((row) => row.group !== "saida" && (row.stale_count > 0 || row.count > 0))
    .sort((left, right) => right.stale_count - left.stale_count || right.count - left.count)
    .slice(0, 3);

  const bottleneckLabel = funnel.top_bottleneck_stage
    ? funnel.by_stage.find((row) => row.stage === funnel.top_bottleneck_stage)?.label || "Sem gargalo"
    : "Sem gargalo";

  return (
    <Card className="h-full border-border/50 bg-background/50 shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Etapa com maior atraso
          </CardTitle>
          <CardDescription>Ponto do funil com mais volume parado neste momento.</CardDescription>
        </div>
        {onViewSales ? (
          <Button variant="outline" size="sm" className="rounded-full" onClick={onViewSales}>
            Ver vendas
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Prioridade no funil</p>
          <p className="mt-2 text-xl font-semibold text-foreground">{bottleneckLabel}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {funnel.stale_total > 0
              ? `${funnel.stale_total} leads estao parados alem do tempo ideal.`
              : "Nenhum acumulo relevante no momento."}
          </p>
        </div>

        <div className="space-y-3">
          {bottleneckRows.length > 0 ? (
            bottleneckRows.slice(0, 2).map((row) => (
              <div key={row.stage} className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.entered_in_period} entradas no periodo</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{row.count} leads</p>
                    <p className="text-xs text-amber-700">{row.stale_count} parados</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
              Sem etapa travada para destacar agora.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardTodayPage({
  data,
  isLoading,
  contacts,
  leadTasks,
  showLeadNextAction,
  teamMode,
  onOpenLeadContact,
  onOpenLeadById,
  onReviewInstallment,
  onViewConversations,
  onViewCalendar,
  onViewSales,
}: DashboardTodayPageProps) {
  const hasLeadActionQueue = showLeadNextAction && contacts.length > 0 && leadTasks.length > 0;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);

  const financialMetrics: DashboardMetricItem[] = data
    ? [
        {
          id: "general-revenue",
          label: "Faturado",
          value: formatCurrency(data.kpis.revenue.value),
          description: "Projetos que entraram em Projeto Pago no periodo.",
          icon: Wallet,
          tone: "emerald",
        },
        {
          id: "general-received",
          label: "Recebido",
          value: formatCurrency(data.finance.received_in_period),
          description: "Valores confirmados no caixa no periodo.",
          icon: CheckCircle2,
          tone: "sky",
        },
        {
          id: "general-scheduled",
          label: "A receber",
          value: formatCurrency(data.finance.scheduled_in_period),
          description: "Parcelas previstas dentro do periodo filtrado.",
          icon: CalendarClock,
          tone: "cyan",
        },
        {
          id: "general-overdue",
          label: "Vencido",
          value: formatCurrency(data.finance.overdue_amount),
          description: `${data.finance.overdue_count} parcelas aguardando definicao.`,
          icon: AlertTriangle,
          tone: "rose",
        },
      ]
    : [];

  const actionPanel = hasLeadActionQueue ? (
    <LeadActionQueuePanel
      contacts={contacts}
      tasks={leadTasks}
      teamMode={teamMode}
      onOpenLead={onOpenLeadContact}
      onViewConversations={onViewConversations}
      limit={5}
      listHeightClassName="h-[320px]"
    />
  ) : (
    <ActionSnapshotCard
      funnel={data?.funnel}
      staleLeads={data?.tables.stale_leads}
      teamMode={teamMode}
      onOpenLead={onOpenLeadById}
      onViewConversations={onViewConversations}
    />
  );

  return (
    <div className="space-y-6">
      <DashboardMetricGrid items={financialMetrics} />

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="min-w-0">{actionPanel}</div>
        <div className="min-w-0">
          <CalendarSummaryPanel
            data={data?.calendar}
            isLoading={isLoading}
            onViewAll={onViewCalendar}
            daysAhead={3}
            eventLimit={4}
            listHeightClassName="h-[320px]"
            title="Compromissos"
            description="Agenda de hoje e dos proximos dias para voce nao deixar visita, ligacao ou retorno escapar."
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="min-w-0">
          <FinanceSnapshotCard
            data={data?.finance}
            isLoading={isLoading}
            mode="today"
            maxInstallments={4}
            listHeightClassName="h-[300px]"
            onReviewInstallment={onReviewInstallment}
            onViewConversations={onViewConversations}
          />
        </div>
        <div className="min-w-0">
          <TodayBottleneckCard funnel={data?.funnel} onViewSales={onViewSales} />
        </div>
      </div>

      <Card className="border-border/50 bg-background/50 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Leads parados</CardTitle>
            <CardDescription>Leads que estao esfriando e precisam de retorno antes de perder tracao.</CardDescription>
          </div>
          {onViewConversations ? (
            <Button variant="outline" size="sm" className="rounded-full" onClick={onViewConversations}>
              Ver leads
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <StaleLeadsTable
            data={data?.tables.stale_leads}
            isLoading={isLoading}
            onOpenLead={onOpenLeadById}
            maxHeightClassName="h-[360px]"
          />
        </CardContent>
      </Card>
    </div>
  );
}
