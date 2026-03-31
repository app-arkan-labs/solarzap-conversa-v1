import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KpiGrid } from '@/modules/internal-crm/components/dashboard/cards/KpiGrid';
import { NextActionsPanel } from '@/modules/internal-crm/components/dashboard/cards/NextActionsPanel';
import { OnboardingQueue } from '@/modules/internal-crm/components/dashboard/cards/OnboardingQueue';
import { PipelineMovementChart } from '@/modules/internal-crm/components/dashboard/cards/PipelineMovementChart';
import { useInternalCrmDashboardModule } from '@/modules/internal-crm/hooks/useInternalCrmDashboard';
import { useInternalCrmPipelineStages } from '@/modules/internal-crm/hooks/useInternalCrmApi';

type InternalCrmDashboardViewProps = {
  fromDate: string;
  toDate: string;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
};

export function InternalCrmDashboardView(props: InternalCrmDashboardViewProps) {
  const dashboard = useInternalCrmDashboardModule({
    from_date: props.fromDate,
    to_date: props.toDate,
  });

  const stagesQuery = useInternalCrmPipelineStages();
  const kpis = dashboard.dashboardQuery.data?.kpis;
  const stages = stagesQuery.data?.stages || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Dashboard"
        subtitle="Visão comercial consolidada para venda, fechamento e onboarding."
        icon={BarChart3}
      />

      <div className="grid gap-3 rounded-2xl border border-border/70 p-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Data inicial</Label>
          <Input type="date" value={props.fromDate} onChange={(event) => props.onFromDateChange(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Data final</Label>
          <Input type="date" value={props.toDate} onChange={(event) => props.onToDateChange(event.target.value)} />
        </div>
      </div>

      <KpiGrid kpis={kpis} />

      <PipelineMovementChart
        data={kpis?.pipeline_movement || []}
        stages={stages}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <NextActionsPanel tasks={kpis?.next_actions || []} />
        <OnboardingQueue clients={kpis?.onboarding_queue || []} />
      </div>
    </div>
  );
}
