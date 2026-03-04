import { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Loader2, Pause, Play, Square, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { BroadcastCampaign, BroadcastRecipient } from '@/types/broadcast';

interface BroadcastStatusPanelProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: BroadcastCampaign | null;
  recipients: BroadcastRecipient[];
  onPause: (campaignId: string) => Promise<void>;
  onResume: (campaignId: string) => Promise<void>;
  onCancel: (campaignId: string) => Promise<void>;
}

const statusLabels: Record<BroadcastRecipient['status'], string> = {
  pending: 'Pendente',
  sending: 'Enviando',
  sent: 'Enviado',
  failed: 'Falhou',
  skipped: 'Ignorado',
};

const statusBadgeClass: Record<BroadcastRecipient['status'], string> = {
  pending: 'bg-muted text-muted-foreground',
  sending: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  sent: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  failed: 'bg-destructive/15 text-destructive border-destructive/30',
  skipped: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
};

const formatDuration = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
};

const RecipientStatusIcon = ({ status }: { status: BroadcastRecipient['status'] }) => {
  if (status === 'sent') return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
  if (status === 'failed') return <XCircle className="w-4 h-4 text-destructive" />;
  if (status === 'sending') return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
  return <Clock3 className="w-4 h-4 text-muted-foreground" />;
};

export function BroadcastStatusPanel({
  isOpen,
  onClose,
  campaign,
  recipients,
  onPause,
  onResume,
  onCancel,
}: BroadcastStatusPanelProps) {
  const [actionLoading, setActionLoading] = useState<'pause' | 'resume' | 'cancel' | null>(null);

  const counts = useMemo(() => {
    return recipients.reduce(
      (accumulator, recipient) => {
        accumulator[recipient.status] += 1;
        return accumulator;
      },
      { pending: 0, sending: 0, sent: 0, failed: 0, skipped: 0 },
    );
  }, [recipients]);

  const total = campaign?.total_recipients || recipients.length;
  const done = (campaign?.sent_count || 0) + (campaign?.failed_count || 0);
  const progressValue = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  const remainingRecipients = counts.pending + counts.sending;
  const estimatedSeconds = (campaign?.interval_seconds || 15) * remainingRecipients;

  const handlePause = async () => {
    if (!campaign) return;
    setActionLoading('pause');
    try {
      await onPause(campaign.id);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async () => {
    if (!campaign) return;
    setActionLoading('resume');
    try {
      await onResume(campaign.id);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!campaign) return;
    setActionLoading('cancel');
    try {
      await onCancel(campaign.id);
    } finally {
      setActionLoading(null);
    }
  };

  if (!campaign) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{campaign.name}</DialogTitle>
          <DialogDescription>Acompanhamento em tempo real dos destinatarios da campanha.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="font-semibold capitalize">{campaign.status}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Enviadas</p>
              <p className="font-semibold">{campaign.sent_count}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Falhas</p>
              <p className="font-semibold">{campaign.failed_count}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Tempo estimado</p>
              <p className="font-semibold">{formatDuration(estimatedSeconds)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progresso</span>
              <span className="font-medium">{done}/{total || 0}</span>
            </div>
            <Progress value={progressValue} />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Badge className={statusBadgeClass.sent}>Enviado: {counts.sent}</Badge>
            <Badge className={statusBadgeClass.failed}>Falhou: {counts.failed}</Badge>
            <Badge className={statusBadgeClass.pending}>Pendente: {counts.pending}</Badge>
            <Badge className={statusBadgeClass.sending}>Enviando: {counts.sending}</Badge>
          </div>
        </div>

        <ScrollArea className="h-[320px] border rounded-md p-3 mt-3">
          <div className="space-y-2">
            {recipients.map((recipient) => (
              <div key={recipient.id} className="rounded-md border p-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{recipient.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{recipient.phone}</p>
                  {recipient.error_message && (
                    <p className="text-xs text-destructive truncate">{recipient.error_message}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <RecipientStatusIcon status={recipient.status} />
                  <Badge className={statusBadgeClass[recipient.status]}>{statusLabels[recipient.status]}</Badge>
                </div>
              </div>
            ))}

            {recipients.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum destinatario encontrado para esta campanha.</p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={actionLoading !== null}>
            Fechar
          </Button>

          {campaign.status === 'running' && (
            <>
              <Button type="button" variant="outline" onClick={() => void handlePause()} disabled={actionLoading !== null}>
                {actionLoading === 'pause' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4 mr-1" />}
                Pausar
              </Button>
              <Button type="button" variant="destructive" onClick={() => void handleCancel()} disabled={actionLoading !== null}>
                {actionLoading === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 mr-1" />}
                Cancelar
              </Button>
            </>
          )}

          {(campaign.status === 'paused' || campaign.status === 'draft') && (
            <>
              <Button type="button" onClick={() => void handleResume()} disabled={actionLoading !== null}>
                {actionLoading === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                {campaign.status === 'draft' ? 'Iniciar' : 'Retomar'}
              </Button>
              <Button type="button" variant="destructive" onClick={() => void handleCancel()} disabled={actionLoading !== null}>
                {actionLoading === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 mr-1" />}
                Cancelar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
