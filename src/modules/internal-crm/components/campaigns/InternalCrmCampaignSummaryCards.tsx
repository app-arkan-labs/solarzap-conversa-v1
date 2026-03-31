import { MetricCard } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmCampaign } from '@/modules/internal-crm/types';

type Props = {
  campaigns: InternalCrmCampaign[];
};

export function InternalCrmCampaignSummaryCards({ campaigns }: Props) {
  const totals = campaigns.reduce(
    (acc, c) => {
      acc.running += c.status === 'running' ? 1 : 0;
      acc.recipients += Number(c.recipients_total || 0);
      acc.pending += Number(c.recipients_pending || 0);
      acc.sent += Number(c.recipients_sent || c.sent_count || 0);
      acc.failed += Number(c.recipients_failed || c.failed_count || 0);
      return acc;
    },
    { running: 0, recipients: 0, pending: 0, sent: 0, failed: 0 },
  );

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard title="Campanhas ativas" value={String(totals.running)} subtitle="Em execução agora" />
      <MetricCard title="Destinatários" value={String(totals.recipients)} subtitle="Total nas campanhas" />
      <MetricCard title="Pendentes" value={String(totals.pending)} subtitle="Aguardando envio" />
      <MetricCard title="Enviados" value={String(totals.sent)} subtitle="Mensagens entregues" accentClassName="text-emerald-600" />
      <MetricCard title="Falhas" value={String(totals.failed)} subtitle="Com erro" accentClassName="text-rose-600" />
    </div>
  );
}
