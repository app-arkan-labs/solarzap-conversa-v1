import { useState } from 'react';
import { Ban, Loader2, Megaphone, PauseCircle, Pencil, PlayCircle, Send } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  InternalCrmCampaignModal,
  type InternalCrmCampaignSavePayload,
} from '@/modules/internal-crm/components/campaigns/InternalCrmCampaignModal';
import { InternalCrmCampaignStatusPanel } from '@/modules/internal-crm/components/campaigns/InternalCrmCampaignStatusPanel';
import { TokenBadge, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import { useInternalCrmCampaignsModule } from '@/modules/internal-crm/hooks/useInternalCrmCampaigns';
import type { InternalCrmCampaign } from '@/modules/internal-crm/types';

export function InternalCrmCampaignsView() {
  const { toast } = useToast();
  const campaignsModule = useInternalCrmCampaignsModule();

  const campaigns = campaignsModule.campaignsQuery.data?.campaigns || [];
  const instances = campaignsModule.instancesQuery.data?.instances || [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<InternalCrmCampaign | null>(null);
  const [batchCampaignId, setBatchCampaignId] = useState<string | null>(null);

  async function handleSaveCampaign(payload: InternalCrmCampaignSavePayload) {
    try {
      await campaignsModule.upsertCampaignMutation.mutateAsync({
        action: 'upsert_campaign',
        ...payload,
      });

      toast({ title: 'Campanha salva', description: 'A campanha foi atualizada com sucesso.' });
      setModalOpen(false);
      setEditingCampaign(null);
    } catch {
      toast({
        title: 'Falha ao salvar',
        description: 'Nao foi possivel salvar a campanha.',
        variant: 'destructive',
      });
    }
  }

  async function handleUpdateStatus(campaignId: string, status: InternalCrmCampaign['status']) {
    try {
      await campaignsModule.updateCampaignStatusMutation.mutateAsync({
        action: 'update_campaign_status',
        campaign_id: campaignId,
        status,
      });

      toast({ title: 'Status atualizado', description: `Campanha alterada para ${status}.` });
    } catch {
      toast({
        title: 'Falha ao atualizar status',
        description: 'Nao foi possivel mudar o status da campanha.',
        variant: 'destructive',
      });
    }
  }

  async function handleRunBatch(campaignId: string) {
    setBatchCampaignId(campaignId);
    try {
      await campaignsModule.runCampaignBatchMutation.mutateAsync({
        action: 'run_campaign_batch',
        campaign_id: campaignId,
        batch_size: 20,
      });
      toast({ title: 'Batch executado', description: 'Lote enviado para o worker interno.' });
    } catch {
      toast({
        title: 'Falha ao executar lote',
        description: 'Nao foi possivel iniciar o envio agora.',
        variant: 'destructive',
      });
    } finally {
      setBatchCampaignId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanhas"
        subtitle="Outbound, reativacao e upsell no WhatsApp interno da operacao comercial."
        icon={Megaphone}
        actionContent={
          <Button
            onClick={() => {
              setEditingCampaign(null);
              setModalOpen(true);
            }}
          >
            Nova campanha
          </Button>
        }
      />

      <InternalCrmCampaignStatusPanel campaigns={campaigns} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {campaigns.length === 0 ? (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma campanha criada ainda. Use "Nova campanha" para iniciar.
            </CardContent>
          </Card>
        ) : (
          campaigns.map((campaign) => {
            const isBatchRunning = batchCampaignId === campaign.id;
            const isStatusPending = campaignsModule.updateCampaignStatusMutation.isPending;

            return (
              <Card key={campaign.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="line-clamp-1">{campaign.name}</span>
                    <TokenBadge token={campaign.status} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <p className="text-muted-foreground">
                    {campaign.messages.length} mensagem(ns) prontas.
                  </p>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border/70 p-2">
                      <p className="text-muted-foreground">Total</p>
                      <p className="text-base font-semibold">{campaign.recipients_total || 0}</p>
                    </div>
                    <div className="rounded-lg border border-border/70 p-2">
                      <p className="text-muted-foreground">Pendentes</p>
                      <p className="text-base font-semibold">{campaign.recipients_pending || 0}</p>
                    </div>
                    <div className="rounded-lg border border-border/70 p-2">
                      <p className="text-muted-foreground">Enviados</p>
                      <p className="text-base font-semibold text-emerald-600">
                        {campaign.recipients_sent || campaign.sent_count || 0}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 p-2">
                      <p className="text-muted-foreground">Falhas</p>
                      <p className="text-base font-semibold text-rose-600">
                        {campaign.recipients_failed || campaign.failed_count || 0}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">Atualizada em {formatDateTime(campaign.updated_at)}</p>

                  <div className="flex flex-wrap gap-2">
                    {campaign.status === 'running' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isStatusPending}
                        onClick={() => void handleUpdateStatus(campaign.id, 'paused')}
                      >
                        <PauseCircle className="mr-2 h-4 w-4" />
                        Pausar
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isStatusPending || campaign.status === 'canceled'}
                        onClick={() => void handleUpdateStatus(campaign.id, 'running')}
                      >
                        <PlayCircle className="mr-2 h-4 w-4" />
                        Iniciar
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBatchRunning || campaign.status === 'canceled'}
                      onClick={() => void handleRunBatch(campaign.id)}
                    >
                      {isBatchRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Rodar lote
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingCampaign(campaign);
                        setModalOpen(true);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={campaign.status === 'canceled' || isStatusPending}
                      onClick={() => void handleUpdateStatus(campaign.id, 'canceled')}
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <InternalCrmCampaignModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditingCampaign(null);
        }}
        campaign={editingCampaign}
        instances={instances}
        isSubmitting={campaignsModule.upsertCampaignMutation.isPending}
        onSave={handleSaveCampaign}
      />
    </div>
  );
}
