import { MetricCard, formatCurrencyBr } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmDashboardKpis } from '@/modules/internal-crm/types';

type KpiGridProps = {
  kpis: InternalCrmDashboardKpis | undefined;
};

export function KpiGrid(props: KpiGridProps) {
  const kpis = props.kpis;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Leads no período" value={String(kpis?.leads_in_period ?? 0)} subtitle="Entradas novas no intervalo" />
        <MetricCard title="Leads qualificados" value={String(kpis?.qualified_leads ?? 0)} subtitle="Prontos para avanço" accentClassName="text-amber-700" />
        <MetricCard title="Demos agendadas" value={String(kpis?.demos_scheduled ?? 0)} subtitle="Compromissos comerciais" accentClassName="text-indigo-700" />
        <MetricCard title="Taxa de ganho" value={`${kpis?.win_rate ?? 0}%`} subtitle="Ganhos sobre ganhos + perdas" accentClassName="text-emerald-700" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Receita one-time" value={formatCurrencyBr(kpis?.revenue_one_time_closed_cents ?? 0)} subtitle="Mentorias e serviços" />
        <MetricCard title="MRR vendido" value={formatCurrencyBr(kpis?.mrr_sold_cents ?? 0)} subtitle="Recorrência fechada" accentClassName="text-sky-700" />
        <MetricCard title="MRR ativo" value={formatCurrencyBr(kpis?.mrr_active_cents ?? 0)} subtitle="Assinaturas ativas" />
        <MetricCard title="Onboarding pendente" value={String(kpis?.onboarding_pending ?? 0)} subtitle="Aguardando setup/provisão" accentClassName="text-cyan-700" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard title="Clientes em risco" value={String(kpis?.churn_risk_count ?? 0)} subtitle="Base sensível" accentClassName="text-rose-700" />
        <MetricCard title="Churn no período" value={String(kpis?.churned_in_period ?? 0)} subtitle="Clientes perdidos" />
        <MetricCard title="Propostas enviadas" value={String(kpis?.proposals_sent ?? 0)} subtitle="Etapa proposta_enviada" />
      </div>
    </>
  );
}
