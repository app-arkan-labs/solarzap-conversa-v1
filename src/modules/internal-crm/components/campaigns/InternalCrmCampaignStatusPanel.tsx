import { MetricCard } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmCampaign } from '@/modules/internal-crm/types';

type InternalCrmCampaignStatusPanelProps = {
  campaigns: InternalCrmCampaign[];
};

export function InternalCrmCampaignStatusPanel(props: InternalCrmCampaignStatusPanelProps) {
  const totals = props.campaigns.reduce(
    (acc, campaign) => {
      acc.running += campaign.status === 'running' ? 1 : 0;
      acc.recipients += Number(campaign.recipients_total || 0);
      acc.pending += Number(campaign.recipients_pending || 0);
      acc.sent += Number(campaign.recipients_sent || campaign.sent_count || 0);
      acc.failed += Number(campaign.recipients_failed || campaign.failed_count || 0);
      return acc;
    },
    { running: 0, recipients: 0, pending: 0, sent: 0, failed: 0 },
  );

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard title="Campanhas ativas" value={String(totals.running)} subtitle="Campanhas em execucao agora" />
      <MetricCard title="Destinatarios" value={String(totals.recipients)} subtitle="Total carregado nas campanhas" />
      <MetricCard title="Pendentes" value={String(totals.pending)} subtitle="Aguardando envio" />
      <MetricCard title="Enviados" value={String(totals.sent)} subtitle="Mensagens entregues" accentClassName="text-emerald-600" />
      <MetricCard title="Falhas" value={String(totals.failed)} subtitle="Destinatarios com erro" accentClassName="text-rose-600" />
    </div>
  );
}
