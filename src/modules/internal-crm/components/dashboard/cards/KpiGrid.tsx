import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmDashboardKpis } from '@/modules/internal-crm/types';

type KpiGridProps = {
  kpis: InternalCrmDashboardKpis | undefined;
};

export function KpiGrid(props: KpiGridProps) {
  const kpis = props.kpis;

  return (
    <>
      {/* Linha 1 — Contadores absolutos */}
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          title="Leads no Período"
          value={String(kpis?.leads_in_period ?? 0)}
          subtitle="Novos leads captados"
        />
        <MetricCard
          title="Formulários Preenchidos"
          value={String(kpis?.forms_completed ?? 0)}
          subtitle="Landing page convertidos"
          accentClassName="text-violet-700"
        />
        <MetricCard
          title="Reuniões Agendadas"
          value={String(kpis?.meetings_scheduled ?? 0)}
          subtitle="Compromissos marcados"
          accentClassName="text-indigo-700"
        />
        <MetricCard
          title="Reuniões Realizadas"
          value={String(kpis?.meetings_done ?? 0)}
          subtitle="Presença confirmada"
          accentClassName="text-cyan-700"
        />
        <MetricCard
          title="Contratos Fechados"
          value={String(kpis?.contracts_closed ?? 0)}
          subtitle="Decisão positiva"
          accentClassName="text-emerald-700"
        />
      </div>

      {/* Linha 2 — Taxas percentuais */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Taxa de Preenchimento"
          value={`${kpis?.form_fill_rate ?? 0}%`}
          subtitle="Leads que preencheram formulário"
        />
        <MetricCard
          title="Taxa de Agendamento"
          value={`${kpis?.scheduling_rate ?? 0}%`}
          subtitle="Leads que agendaram reunião"
          accentClassName="text-indigo-700"
        />
        <MetricCard
          title="Taxa de Comparecimento"
          value={`${kpis?.attendance_rate ?? 0}%`}
          subtitle="Leads que compareceram"
          accentClassName="text-cyan-700"
        />
        <MetricCard
          title="Taxa de Fechamento"
          value={`${kpis?.closing_rate ?? 0}%`}
          subtitle="Leads que fecharam contrato"
          accentClassName="text-emerald-700"
        />
      </div>

      {/* Linha 3 — Base de clientes */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Contas em Teste"
          value={String(kpis?.trial_accounts ?? 0)}
          subtitle="Período de avaliação"
          accentClassName="text-amber-700"
        />
        <SubscribersCard
          start={kpis?.active_subscribers_start ?? 0}
          pro={kpis?.active_subscribers_pro ?? 0}
          scale={kpis?.active_subscribers_scale ?? 0}
        />
        <MetricCard
          title="Churn no Período"
          value={String(kpis?.churned_in_period ?? 0)}
          subtitle="Clientes que cancelaram"
          accentClassName="text-rose-700"
        />
      </div>
    </>
  );
}

function SubscribersCard(props: { start: number; pro: number; scale: number }) {
  const total = props.start + props.pro + props.scale;
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">Assinantes Ativos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          {total}
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
            Start: <strong>{props.start}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
            Pro: <strong>{props.pro}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Scale: <strong>{props.scale}</strong>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
