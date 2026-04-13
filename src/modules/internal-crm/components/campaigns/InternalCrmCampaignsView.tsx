import { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, Pause, Play, Plus, Square, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { formatBroadcastInterval } from '@/utils/broadcastTimer';
import { InternalCrmCampaignModal, type InternalCrmCampaignInput } from './InternalCrmCampaignModal';
import { InternalCrmCampaignStatusPanel } from './InternalCrmCampaignStatusPanel';
import { invokeInternalCrmApi, useInternalCrmInstances } from '@/modules/internal-crm/hooks/useInternalCrmApi';
import { InternalCrmCompactBar } from '@/modules/internal-crm/components/InternalCrmPageLayout';
import { useInternalCrmCampaignsModule } from '@/modules/internal-crm/hooks/useInternalCrmCampaigns';
import type { InternalCrmCampaign, InternalCrmCampaignRecipient } from '@/modules/internal-crm/types';

const campaignStatusClass: Record<InternalCrmCampaign['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  running: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  paused: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  completed: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  canceled: 'bg-destructive/15 text-destructive border-destructive/30',
};

const campaignStatusLabel: Record<InternalCrmCampaign['status'], string> = {
  draft: 'Rascunho',
  running: 'Rodando',
  paused: 'Pausada',
  completed: 'Concluida',
  canceled: 'Cancelada',
};

export function InternalCrmCampaignsView() {
  const { toast } = useToast();
  const campaignsModule = useInternalCrmCampaignsModule();

  const instancesQuery = useInternalCrmInstances();
  const instances = useMemo(() => {
    const raw = instancesQuery.data?.instances || [];
    return raw.map((instance) => ({
      id: instance.id,
      instance_name: instance.instance_name,
      display_name: instance.display_name,
      status: instance.status,
      is_active: instance.status === 'connected',
    }));
  }, [instancesQuery.data]);
  const instanceNameById = useMemo(
    () => new Map(instances.map((instance) => [instance.id, instance.display_name || instance.instance_name])),
    [instances],
  );

  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [statusPanelCampaignId, setStatusPanelCampaignId] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<InternalCrmCampaign | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<InternalCrmCampaignRecipient[]>([]);

  const campaigns = campaignsModule.campaignsQuery.data?.campaigns || [];
  const isLoading = campaignsModule.campaignsQuery.isLoading;
  const error = campaignsModule.campaignsQuery.error instanceof Error
    ? campaignsModule.campaignsQuery.error.message
    : null;

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === statusPanelCampaignId) || null,
    [campaigns, statusPanelCampaignId],
  );

  useEffect(() => {
    if (!statusPanelCampaignId) {
      setSelectedRecipients([]);
      return;
    }

    const fetchRecipients = async () => {
      try {
        const result = await invokeInternalCrmApi<{ ok: true; recipients: InternalCrmCampaignRecipient[] }>({
          action: 'list_campaign_recipients',
          campaign_id: statusPanelCampaignId,
        });
        setSelectedRecipients(result.recipients || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar destinatarios';
        toast({ title: 'Falha ao carregar destinatarios', description: message, variant: 'destructive' });
      }
    };

    void fetchRecipients();
    const interval = setInterval(() => {
      void fetchRecipients();
    }, 4000);
    return () => clearInterval(interval);
  }, [statusPanelCampaignId, toast]);

  const runCampaignAction = async (
    campaignId: string,
    actionName: 'start' | 'pause' | 'resume' | 'cancel',
    action: () => Promise<void>,
  ) => {
    setActionInFlight(`${campaignId}:${actionName}`);
    try {
      await action();
      const successMessage = {
        start: 'Campanha iniciada',
        pause: 'Campanha pausada',
        resume: 'Campanha retomada',
        cancel: 'Campanha cancelada',
      }[actionName];
      toast({ title: successMessage });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro na acao da campanha';
      toast({ title: 'Falha na campanha', description: message, variant: 'destructive' });
    } finally {
      setActionInFlight(null);
    }
  };

  const handleSubmitCampaign = async (input: InternalCrmCampaignInput, autoStart: boolean) => {
    const selectedInstance = instances.find((instance) => instance.instance_name === input.instance_name);
    if (!selectedInstance?.id) {
      throw new Error('Instancia selecionada nao encontrada.');
    }

    const created = await campaignsModule.upsertCampaignMutation.mutateAsync({
      action: 'upsert_campaign',
      name: input.name,
      whatsapp_instance_id: selectedInstance.id,
      messages: input.messages,
      interval_seconds: input.interval_seconds,
      status: 'draft',
      recipients: (input.recipients || []).map((recipient) => ({
        client_id: recipient.client_id || null,
        recipient_name: recipient.name,
        recipient_phone: recipient.phone,
        payload: recipient.email ? { email: recipient.email } : {},
      })),
    }) as { campaign?: InternalCrmCampaign };

    const createdCampaign = created.campaign;
    if (!createdCampaign?.id) {
      throw new Error('Falha ao salvar campanha');
    }

    if (autoStart) {
      await runCampaignAction(createdCampaign.id, 'start', async () => {
        await campaignsModule.runCampaignBatchMutation.mutateAsync({
          action: 'run_campaign_batch',
          campaign_id: createdCampaign.id,
          batch_size: 1,
        });
      });
    } else {
      toast({ title: 'Campanha salva como rascunho' });
    }

    setStatusPanelCampaignId(createdCampaign.id);
  };

  const handleDeleteCampaign = async () => {
    if (!campaignToDelete) return;
    const deletingCampaign = campaignToDelete;
    setActionInFlight(`${deletingCampaign.id}:delete`);
    try {
      if (deletingCampaign.status === 'running') {
        await campaignsModule.updateCampaignStatusMutation.mutateAsync({
          action: 'update_campaign_status',
          campaign_id: deletingCampaign.id,
          status: 'canceled',
        });
      }

      await campaignsModule.deleteCampaignMutation.mutateAsync({
        action: 'delete_campaign',
        campaign_id: deletingCampaign.id,
      });

      toast({ title: 'Campanha deletada' });
      if (statusPanelCampaignId === deletingCampaign.id) {
        setStatusPanelCampaignId(null);
      }
      setCampaignToDelete(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao deletar campanha';
      toast({ title: 'Falha ao deletar campanha', description: message, variant: 'destructive' });
    } finally {
      setActionInFlight(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-muted/30 overflow-hidden min-h-0">
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <InternalCrmCompactBar className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Button
            data-testid="admin-broadcast-create-campaign"
            onClick={() => setIsCampaignModalOpen(true)}
            className="h-10 w-full gap-2 font-semibold sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            Nova Campanha
          </Button>
        </InternalCrmCompactBar>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="w-full space-y-6 px-4 py-4 sm:px-6 sm:py-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isLoading && campaigns.length === 0 ? (
            <div className="rounded-lg border border-border/50 bg-background/50 glass shadow-sm p-8 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando campanhas...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {campaigns.map((campaign) => {
                const progressBase = campaign.recipients_total && campaign.recipients_total > 0
                  ? ((campaign.sent_count + campaign.failed_count) / campaign.recipients_total) * 100
                  : 0;

                return (
                  <Card key={campaign.id} className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-base">{campaign.name}</CardTitle>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            Instancia: {instanceNameById.get(campaign.whatsapp_instance_id || '') || 'Nao definida'}
                          </p>
                        </div>
                        <Badge className={campaignStatusClass[campaign.status]}>{campaignStatusLabel[campaign.status]}</Badge>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Progresso</span>
                          <span>{campaign.sent_count + campaign.failed_count}/{campaign.recipients_total || 0}</span>
                        </div>
                        <Progress value={Math.min(100, progressBase)} />
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                        <div className="rounded border p-2">
                          <p className="text-muted-foreground">Enviadas</p>
                          <p className="font-semibold">{campaign.sent_count}</p>
                        </div>
                        <div className="rounded border p-2">
                          <p className="text-muted-foreground">Falhas</p>
                          <p className="font-semibold">{campaign.failed_count}</p>
                        </div>
                        <div className="rounded border p-2">
                          <p className="text-muted-foreground">Timer</p>
                          <p className="font-semibold">{formatBroadcastInterval(campaign.interval_seconds)}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setStatusPanelCampaignId(campaign.id)}>
                          <Eye className="w-4 h-4 mr-1" />
                          Detalhes
                        </Button>

                        {(campaign.status === 'draft' || campaign.status === 'paused') && (
                          <Button
                            size="sm"
                            onClick={() => void runCampaignAction(
                              campaign.id,
                              campaign.status === 'draft' ? 'start' : 'resume',
                              () => campaignsModule.runCampaignBatchMutation.mutateAsync({
                                action: 'run_campaign_batch',
                                campaign_id: campaign.id,
                                batch_size: 1,
                              }).then(() => undefined),
                            )}
                            disabled={actionInFlight !== null}
                          >
                            {actionInFlight === `${campaign.id}:${campaign.status === 'draft' ? 'start' : 'resume'}` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Play className="w-4 h-4 mr-1" />
                                {campaign.status === 'draft' ? 'Iniciar' : 'Retomar'}
                              </>
                            )}
                          </Button>
                        )}

                        {campaign.status === 'running' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void runCampaignAction(campaign.id, 'pause', () => campaignsModule.updateCampaignStatusMutation.mutateAsync({
                              action: 'update_campaign_status',
                              campaign_id: campaign.id,
                              status: 'paused',
                            }).then(() => undefined))}
                            disabled={actionInFlight !== null}
                          >
                            {actionInFlight === `${campaign.id}:pause` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Pause className="w-4 h-4 mr-1" />
                                Pausar
                              </>
                            )}
                          </Button>
                        )}

                        {(campaign.status === 'running' || campaign.status === 'paused' || campaign.status === 'draft') && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void runCampaignAction(campaign.id, 'cancel', () => campaignsModule.updateCampaignStatusMutation.mutateAsync({
                              action: 'update_campaign_status',
                              campaign_id: campaign.id,
                              status: 'canceled',
                            }).then(() => undefined))}
                            disabled={actionInFlight !== null}
                          >
                            {actionInFlight === `${campaign.id}:cancel` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Square className="w-4 h-4 mr-1" />
                                Cancelar
                              </>
                            )}
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/40 text-destructive hover:text-destructive hover:bg-destructive/5"
                          onClick={() => setCampaignToDelete(campaign)}
                          disabled={actionInFlight !== null}
                        >
                          {actionInFlight === `${campaign.id}:delete` ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4 mr-1" />
                              Deletar
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {campaigns.length === 0 && (
                <Card className="lg:col-span-2 border-border/50 bg-background/50 glass shadow-sm">
                  <CardContent className="py-16 text-center text-muted-foreground">
                    Nenhuma campanha criada ainda. Clique em "Nova Campanha" para iniciar.
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      <InternalCrmCampaignModal
        isOpen={isCampaignModalOpen}
        onClose={() => setIsCampaignModalOpen(false)}
        instances={instances}
        onSubmit={handleSubmitCampaign}
      />

      <InternalCrmCampaignStatusPanel
        isOpen={statusPanelCampaignId !== null}
        onClose={() => setStatusPanelCampaignId(null)}
        campaign={selectedCampaign}
        recipients={selectedRecipients}
        onPause={(campaignId) => campaignsModule.updateCampaignStatusMutation.mutateAsync({
          action: 'update_campaign_status',
          campaign_id: campaignId,
          status: 'paused',
        }).then(() => undefined)}
        onResume={(campaignId) => campaignsModule.runCampaignBatchMutation.mutateAsync({
          action: 'run_campaign_batch',
          campaign_id: campaignId,
          batch_size: 1,
        }).then(() => undefined)}
        onCancel={(campaignId) => campaignsModule.updateCampaignStatusMutation.mutateAsync({
          action: 'update_campaign_status',
          campaign_id: campaignId,
          status: 'canceled',
        }).then(() => undefined)}
      />

      <AlertDialog open={campaignToDelete !== null} onOpenChange={(open) => !open && setCampaignToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao removera a campanha "{campaignToDelete?.name || ''}" e seu historico de envios.
              {campaignToDelete?.status === 'running' ? ' A campanha sera cancelada antes da exclusao.' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionInFlight !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteCampaign();
              }}
              disabled={actionInFlight !== null}
            >
              {campaignToDelete && actionInFlight === `${campaignToDelete.id}:delete` ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Deletar campanha'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
