import { useState } from 'react';
import { Ban, Clock, Loader2, Megaphone, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { formatBroadcastInterval } from '@/utils/broadcastTimer';
import { InternalCrmCampaignModal } from '@/modules/internal-crm/components/campaigns/InternalCrmCampaignModal';
import { InternalCrmCampaignStatusPanel } from '@/modules/internal-crm/components/campaigns/InternalCrmCampaignStatusPanel';
import { InternalCrmCampaignSummaryCards } from '@/modules/internal-crm/components/campaigns/InternalCrmCampaignSummaryCards';
import { useInternalCrmCampaignsModule } from '@/modules/internal-crm/hooks/useInternalCrmCampaigns';
import type { InternalCrmCampaign } from '@/modules/internal-crm/types';

const STATUS_MAP: Record<InternalCrmCampaign['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  running: { label: 'Enviando', variant: 'default', className: 'bg-blue-600 hover:bg-blue-700' },
  paused: { label: 'Pausada', variant: 'outline', className: 'border-amber-500 text-amber-600' },
  completed: { label: 'Concluída', variant: 'default', className: 'bg-emerald-600 hover:bg-emerald-700' },
  canceled: { label: 'Cancelada', variant: 'destructive' },
};

export function InternalCrmCampaignsView() {
  const { toast } = useToast();
  const mod = useInternalCrmCampaignsModule();

  const campaigns = mod.campaignsQuery.data?.campaigns || [];
  const instances = mod.instancesQuery.data?.instances || [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<InternalCrmCampaign | null>(null);
  const [detailCampaign, setDetailCampaign] = useState<InternalCrmCampaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InternalCrmCampaign | null>(null);

  async function handleUpdateStatus(campaignId: string, status: InternalCrmCampaign['status']) {
    try {
      await mod.updateCampaignStatusMutation.mutateAsync({
        action: 'update_campaign_status',
        campaign_id: campaignId,
        status,
      });
      if (status === 'running') {
        await mod.runCampaignBatchMutation.mutateAsync({
          action: 'run_campaign_batch',
          campaign_id: campaignId,
          batch_size: 20,
        });
      }
      const labels: Record<string, string> = { running: 'iniciada', paused: 'pausada', canceled: 'cancelada' };
      toast({ title: `Campanha ${labels[status] || 'atualizada'}` });
    } catch {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await mod.deleteCampaignMutation.mutateAsync({
        action: 'delete_campaign',
        campaign_id: deleteTarget.id,
      });
      toast({ title: 'Campanha excluída' });
    } catch {
      toast({ title: 'Erro ao excluir campanha', variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanhas"
        subtitle="Disparos em massa no WhatsApp da operação comercial."
        icon={Megaphone}
        actionContent={
          <Button onClick={() => { setEditingCampaign(null); setModalOpen(true); }}>
            Nova Campanha
          </Button>
        }
      />

      <InternalCrmCampaignSummaryCards campaigns={campaigns} />

      <div className="grid gap-4 lg:grid-cols-2">
        {campaigns.length === 0 ? (
          <Card className="lg:col-span-2">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma campanha criada ainda. Clique em "Nova Campanha" para começar.
            </CardContent>
          </Card>
        ) : (
          campaigns.map((c) => {
            const total = c.recipients_total || 0;
            const sent = c.recipients_sent || c.sent_count || 0;
            const failed = c.recipients_failed || c.failed_count || 0;
            const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
            const s = STATUS_MAP[c.status];
            const isPending = mod.updateCampaignStatusMutation.isPending;

            return (
              <Card key={c.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {/* Header: name + badge */}
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-sm line-clamp-1">{c.name}</h3>
                    <Badge variant={s.variant} className={s.className}>{s.label}</Badge>
                  </div>

                  {/* Progress */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{sent} de {total} enviadas</span>
                      <span>{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg border p-2">
                      <p className="text-muted-foreground">Enviadas</p>
                      <p className="text-base font-bold text-emerald-600">{sent}</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-muted-foreground">Falhas</p>
                      <p className="text-base font-bold text-rose-600">{failed}</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-muted-foreground">Timer</p>
                      <p className="text-base font-bold flex items-center justify-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatBroadcastInterval(c.interval_seconds ?? 15)}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => setDetailCampaign(c)}>
                      Detalhes
                    </Button>

                    {c.status === 'draft' || c.status === 'paused' ? (
                      <Button
                        variant="outline" size="sm"
                        disabled={isPending}
                        onClick={() => void handleUpdateStatus(c.id, 'running')}
                      >
                        {mod.runCampaignBatchMutation.isPending ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {c.status === 'paused' ? 'Retomar' : 'Iniciar'}
                      </Button>
                    ) : c.status === 'running' ? (
                      <Button
                        variant="outline" size="sm"
                        disabled={isPending}
                        onClick={() => void handleUpdateStatus(c.id, 'paused')}
                      >
                        <PauseCircle className="mr-1.5 h-3.5 w-3.5" />
                        Pausar
                      </Button>
                    ) : null}

                    {c.status === 'running' && (
                      <Button
                        variant="ghost" size="sm"
                        disabled={isPending}
                        onClick={() => void handleUpdateStatus(c.id, 'canceled')}
                      >
                        <Ban className="mr-1.5 h-3.5 w-3.5" />
                        Cancelar
                      </Button>
                    )}

                    {(c.status === 'draft' || c.status === 'completed' || c.status === 'canceled') && (
                      <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700"
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Excluir
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Campaign wizard modal */}
      <InternalCrmCampaignModal
        open={modalOpen}
        onOpenChange={(open) => { setModalOpen(open); if (!open) setEditingCampaign(null); }}
        campaign={editingCampaign}
        instances={instances}
        isSubmitting={mod.upsertCampaignMutation.isPending}
        onSave={async (payload) => {
          try {
            await mod.upsertCampaignMutation.mutateAsync({ action: 'upsert_campaign', ...payload });
            toast({ title: 'Campanha salva' });
            setModalOpen(false);
            setEditingCampaign(null);
          } catch {
            toast({ title: 'Falha ao salvar campanha', variant: 'destructive' });
          }
        }}
      />

      {/* Detail / status panel */}
      <InternalCrmCampaignStatusPanel
        campaign={detailCampaign}
        open={!!detailCampaign}
        onOpenChange={(open) => { if (!open) setDetailCampaign(null); }}
        onUpdateStatus={handleUpdateStatus}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              A campanha <strong>{deleteTarget?.name}</strong> e todos os seus destinatários serão
              removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
