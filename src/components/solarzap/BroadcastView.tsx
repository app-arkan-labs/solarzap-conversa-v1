import { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, Pause, Play, Plus, Square, SendHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBroadcasts, type BroadcastCampaignInput } from '@/hooks/useBroadcasts';
import { useUserWhatsAppInstances } from '@/hooks/useUserWhatsAppInstances';
import { useToast } from '@/hooks/use-toast';
import { BroadcastCampaignModal } from './BroadcastCampaignModal';
import { BroadcastStatusPanel } from './BroadcastStatusPanel';
import type { BroadcastCampaign } from '@/types/broadcast';

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
  } = useBroadcasts();
  const { instances } = useUserWhatsAppInstances();

  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [statusPanelCampaignId, setStatusPanelCampaignId] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

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

  return (
    <div className="flex-1 h-full overflow-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <SendHorizontal className="w-5 h-5 text-primary" />
            Disparos em Massa
          </h1>
          <p className="text-sm text-muted-foreground">Crie campanhas, acompanhe progresso e controle o envio via WhatsApp.</p>
        </div>

        <Button onClick={() => setIsCampaignModalOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Nova Campanha
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading && campaigns.length === 0 ? (
        <div className="rounded-lg border p-8 flex items-center justify-center gap-2 text-muted-foreground">
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
              <Card key={campaign.id} className="border-muted/70">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{campaign.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">Instancia: {campaign.instance_name}</p>
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
                  <div className="grid grid-cols-3 gap-2 text-xs">
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
                      <p className="font-semibold">{campaign.interval_seconds}s</p>
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
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {campaigns.length === 0 && (
            <Card className="lg:col-span-2">
              <CardContent className="py-16 text-center text-muted-foreground">
                Nenhuma campanha criada ainda. Clique em "Nova Campanha" para iniciar.
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
    </div>
  );
}
