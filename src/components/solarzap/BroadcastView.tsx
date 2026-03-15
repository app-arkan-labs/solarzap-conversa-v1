import { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, Pause, Play, Plus, Square, SendHorizontal, Trash2, Zap } from 'lucide-react';
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
import { useBroadcasts, type BroadcastCampaignInput } from '@/hooks/useBroadcasts';
import { useUserWhatsAppInstances } from '@/hooks/useUserWhatsAppInstances';
import { useToast } from '@/hooks/use-toast';
import { formatBroadcastInterval } from '@/utils/broadcastTimer';
import { PageHeader } from './PageHeader';
import { BroadcastCampaignModal } from './BroadcastCampaignModal';
import { BroadcastStatusPanel } from './BroadcastStatusPanel';
import type { BroadcastCampaign } from '@/types/broadcast';
import { useBillingBlocker } from '@/contexts/BillingBlockerContext';

const campaignStatusClass: Record<BroadcastCampaign['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  running: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  paused: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  completed: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  canceled: 'bg-destructive/15 text-destructive border-destructive/30',
};

const campaignStatusLabel: Record<BroadcastCampaign['status'], string> = {
  draft: 'Rascunho',
  running: 'Rodando',
  paused: 'Pausada',
  completed: 'Concluida',
  canceled: 'Cancelada',
};

export function BroadcastView() {
  const { toast } = useToast();
  const { openPackPurchase } = useBillingBlocker();
  const {
    campaigns,
    recipientsByCampaign,
    isLoading,
    error,
    fetchCampaignRecipients,
    createCampaign,
    startCampaign,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign,
    deleteCampaign,
  } = useBroadcasts();
  const { instances } = useUserWhatsAppInstances();

  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [statusPanelCampaignId, setStatusPanelCampaignId] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<BroadcastCampaign | null>(null);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === statusPanelCampaignId) || null,
    [campaigns, statusPanelCampaignId],
  );

  const selectedRecipients = useMemo(() => {
    if (!statusPanelCampaignId) return [];
    return recipientsByCampaign[statusPanelCampaignId] || [];
  }, [recipientsByCampaign, statusPanelCampaignId]);

  useEffect(() => {
    if (!statusPanelCampaignId) return;

    void fetchCampaignRecipients(statusPanelCampaignId);
    const interval = setInterval(() => {
      void fetchCampaignRecipients(statusPanelCampaignId);
    }, 4000);

    return () => clearInterval(interval);
  }, [fetchCampaignRecipients, statusPanelCampaignId]);

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
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : 'Erro na acao da campanha';
      toast({ title: 'Falha na campanha', description: message, variant: 'destructive' });
    } finally {
      setActionInFlight(null);
    }
  };

  const handleSubmitCampaign = async (input: BroadcastCampaignInput, autoStart: boolean) => {
    const createdCampaign = await createCampaign(input);

    if (autoStart) {
      await runCampaignAction(createdCampaign.id, 'start', () => startCampaign(createdCampaign.id));
    } else {
      toast({ title: 'Campanha salva como rascunho' });
    }

    setStatusPanelCampaignId(createdCampaign.id);
  };

  const openStatusPanel = (campaignId: string) => {
    setStatusPanelCampaignId(campaignId);
  };

  const handleDeleteCampaign = async () => {
    if (!campaignToDelete) return;

    const deletingCampaign = campaignToDelete;
    setActionInFlight(`${deletingCampaign.id}:delete`);

    try {
      if (deletingCampaign.status === 'running') {
        await cancelCampaign(deletingCampaign.id);
      }

      await deleteCampaign(deletingCampaign.id);
      toast({ title: 'Campanha deletada' });

      if (statusPanelCampaignId === deletingCampaign.id) {
        setStatusPanelCampaignId(null);
      }
      setCampaignToDelete(null);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Erro ao deletar campanha';
      toast({ title: 'Falha ao deletar campanha', description: message, variant: 'destructive' });
    } finally {
      setActionInFlight(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-muted/30 overflow-hidden min-h-0">
      <PageHeader
        title="Disparos em Massa"
        subtitle="Crie campanhas, acompanhe progresso e controle o envio via WhatsApp."
        icon={SendHorizontal}
        actionContent={(
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                void openPackPurchase('disparo', { source: 'broadcasts' });
              }}
              className="h-10 w-full gap-2 font-semibold sm:w-auto"
            >
              <Zap className="w-4 h-4" />
              Comprar créditos
            </Button>
            <Button
              data-testid="broadcast-create-campaign"
              onClick={() => setIsCampaignModalOpen(true)}
              className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 gap-2 font-semibold h-10 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              Nova Campanha
            </Button>
          </div>
        )}
        mobileToolbar={(
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs px-2"
              onClick={() => { void openPackPurchase('disparo', { source: 'broadcasts' }); }}
            >
              <Zap className="w-3.5 h-3.5" />
              Créditos
            </Button>
            <Button
              data-testid="broadcast-create-campaign"
              size="sm"
              onClick={() => setIsCampaignModalOpen(true)}
              className="bg-primary hover:bg-primary/90 gap-1 h-8 px-3 font-semibold text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova
            </Button>
          </div>
        )}
      />

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
                const progressBase = campaign.total_recipients > 0
                  ? ((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100
                  : 0;

                return (
                  <Card key={campaign.id} className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-base">{campaign.name}</CardTitle>
                          <p className="mt-1 truncate text-xs text-muted-foreground">Instancia: {campaign.instance_name}</p>
                        </div>
                        <Badge className={campaignStatusClass[campaign.status]}>{campaignStatusLabel[campaign.status]}</Badge>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Progresso</span>
                          <span>
                            {campaign.sent_count + campaign.failed_count}/{campaign.total_recipients}
                          </span>
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
                        <Button size="sm" variant="outline" onClick={() => openStatusPanel(campaign.id)}>
                          <Eye className="w-4 h-4 mr-1" />
                          Detalhes
                        </Button>

                        {(campaign.status === 'draft' || campaign.status === 'paused') && (
                          <Button
                            size="sm"
                            onClick={() => void runCampaignAction(
                              campaign.id,
                              campaign.status === 'draft' ? 'start' : 'resume',
                              () => (campaign.status === 'draft' ? startCampaign(campaign.id) : resumeCampaign(campaign.id)),
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
                            onClick={() => void runCampaignAction(campaign.id, 'pause', () => pauseCampaign(campaign.id))}
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
                            onClick={() => void runCampaignAction(campaign.id, 'cancel', () => cancelCampaign(campaign.id))}
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

      <BroadcastCampaignModal
        isOpen={isCampaignModalOpen}
        onClose={() => setIsCampaignModalOpen(false)}
        instances={instances}
        onSubmit={(input, autoStart) => handleSubmitCampaign(input, autoStart)}
      />

      <BroadcastStatusPanel
        isOpen={statusPanelCampaignId !== null}
        onClose={() => setStatusPanelCampaignId(null)}
        campaign={selectedCampaign}
        recipients={selectedRecipients}
        onPause={pauseCampaign}
        onResume={resumeCampaign}
        onCancel={cancelCampaign}
      />

      <AlertDialog open={campaignToDelete !== null} onOpenChange={(open) => !open && setCampaignToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá a campanha "{campaignToDelete?.name || ''}" e seu histórico de envios.
              {campaignToDelete?.status === 'running' ? ' A campanha será cancelada antes da exclusão.' : ''}
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
