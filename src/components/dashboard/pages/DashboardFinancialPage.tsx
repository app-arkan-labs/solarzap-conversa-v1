import { AlertTriangle, CalendarClock, CheckCircle2, TrendingUp, Wallet } from "lucide-react";

import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { DashboardMetricGrid, type DashboardMetricItem } from "@/components/dashboard/DashboardMetricGrid";
import { FinanceSnapshotCard } from "@/components/dashboard/FinanceSnapshotCard";
import type { DashboardPayload } from "@/types/dashboard";

interface DashboardFinancialPageProps {
  data?: DashboardPayload;
  isLoading: boolean;
  onOpenLeadByName: (leadName: string) => void;
  onViewConversations?: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);

export function DashboardFinancialPage({
  data,
  isLoading,
  onOpenLeadByName,
  onViewConversations,
}: DashboardFinancialPageProps) {
  if (!data) {
    return (
      <div className="space-y-6">
        <DashboardCharts data={undefined} kpis={undefined} isLoading={isLoading} mode="financial" />
      </div>
    );
  }

  const revenueLabel = data.kpis.revenue.basis === "project_paid" ? "Faturado" : "Valor fechado";
  const revenueDescription =
    data.kpis.revenue.basis === "project_paid"
      ? "Projetos que entraram em Projeto Pago no periodo."
      : "Vendas fechadas dentro do periodo selecionado.";

  const metrics: DashboardMetricItem[] = [
    {
      id: "financial-revenue",
      label: revenueLabel,
      value: formatCurrency(data.kpis.revenue.value),
      description: revenueDescription,
      icon: Wallet,
      tone: "emerald",
    },
    {
      id: "financial-received",
      label: "Recebido",
      value: formatCurrency(data.finance.received_in_period),
      description: "Parcelas confirmadas no periodo.",
      icon: CheckCircle2,
      tone: "sky",
    },
    {
      id: "financial-profit",
      label: "Lucro realizado",
      value: formatCurrency(data.finance.realized_profit_in_period),
      description: "Lucro reconhecido nas parcelas pagas.",
      icon: TrendingUp,
      tone: "emerald",
    },
    {
      id: "financial-scheduled",
      label: "A receber no periodo",
      value: formatCurrency(data.finance.scheduled_in_period),
      description: "Parcelas previstas no intervalo filtrado.",
      icon: CalendarClock,
      tone: "cyan",
    },
    {
      id: "financial-overdue",
      label: "Vencido",
      value: formatCurrency(data.finance.overdue_amount),
      description: `${data.finance.overdue_count} parcelas em atraso.`,
      icon: AlertTriangle,
      tone: "rose",
    },
    {
      id: "financial-next",
      label: "Proximos 7 dias",
      value: formatCurrency(data.finance.due_next_7_days_amount),
      description: `${data.finance.due_next_7_days_count} parcelas para acompanhar.`,
      icon: CalendarClock,
      tone: "amber",
    },
  ];

  return (
    <div className="space-y-6">
      <DashboardMetricGrid items={metrics} className="xl:grid-cols-3" />

      <FinanceSnapshotCard
        data={data.finance}
        isLoading={isLoading}
        maxInstallments={8}
        mode="financial"
        onOpenLead={onOpenLeadByName}
        onViewConversations={onViewConversations}
      />

      <DashboardCharts data={data.charts} kpis={data.kpis} isLoading={isLoading} mode="financial" />
    </div>
  );
}
