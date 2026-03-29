import { MetricCard, formatCurrencyBr } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmFinanceSummary } from '@/modules/internal-crm/types';

type RevenueKpiGridProps = {
  summary: InternalCrmFinanceSummary | undefined;
  pendingPaymentsRows: number;
};

export function RevenueKpiGrid(props: RevenueKpiGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard
        title="Receita one-time"
        value={formatCurrencyBr(props.summary?.revenue_one_time_cents ?? 0)}
        subtitle="Servicos e mentorias pagas"
      />
      <MetricCard
        title="MRR vendido"
        value={formatCurrencyBr(props.summary?.mrr_sold_cents ?? 0)}
        subtitle="Promessa comercial em deals ganhos"
        accentClassName="text-sky-700"
      />
      <MetricCard
        title="MRR ativo"
        value={formatCurrencyBr(props.summary?.mrr_active_cents ?? 0)}
        subtitle="Recorrencia ativa em subscriptions"
        accentClassName="text-emerald-700"
      />
      <MetricCard
        title="Churn"
        value={String(props.summary?.churned_count ?? 0)}
        subtitle="Subscriptions canceladas"
        accentClassName="text-rose-700"
      />
      <MetricCard
        title="Pendencias"
        value={String(props.pendingPaymentsRows)}
        subtitle="Orders e subscriptions com atencao"
        accentClassName="text-amber-700"
      />
    </div>
  );
}
