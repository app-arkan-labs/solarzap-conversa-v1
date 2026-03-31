import { Ban, Check, Clock, Loader2, PauseCircle, PlayCircle, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatBroadcastInterval } from '@/utils/broadcastTimer';
import { invokeInternalCrmApi } from '@/modules/internal-crm/hooks/useInternalCrmApi';
import type { InternalCrmCampaign, InternalCrmCampaignRecipient } from '@/modules/internal-crm/types';

type Props = {
  campaign: InternalCrmCampaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (campaignId: string, status: InternalCrmCampaign['status']) => Promise<void>;
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  processing: <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />,
  sent: <Check className="h-3.5 w-3.5 text-emerald-600" />,
  failed: <X className="h-3.5 w-3.5 text-rose-600" />,
  skipped: <Ban className="h-3.5 w-3.5 text-amber-500" />,
  canceled: <Ban className="h-3.5 w-3.5 text-muted-foreground" />,
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  processing: 'Enviando...',
  sent: 'Enviado',
  failed: 'Falhou',
  skipped: 'Ignorado',
  canceled: 'Cancelado',
};

export function InternalCrmCampaignStatusPanel({ campaign, open, onOpenChange, onUpdateStatus }: Props) {
  const isRunning = campaign?.status === 'running';

  const { data } = useQuery({
    queryKey: ['internal-crm', 'campaign-recipients', campaign?.id],
    queryFn: () =>
      invokeInternalCrmApi<{ ok: true; recipients: InternalCrmCampaignRecipient[] }>({
        action: 'list_campaign_recipients',
        campaign_id: campaign?.id,
      }),
    enabled: open && Boolean(campaign?.id),
    refetchInterval: isRunning ? 4000 : false,
  });

  const recipients = data?.recipients || [];
  const total = campaign?.recipients_total || recipients.length || 0;
  const sent = campaign?.recipients_sent || campaign?.sent_count || 0;
  const failed = campaign?.recipients_failed || campaign?.failed_count || 0;
  const pending = total - sent - failed;
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;

  const estimatedRemaining = pending > 0 ? pending * (campaign?.interval_seconds ?? 15) : 0;

  if (!campaign) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="pr-6">{campaign.name}</DialogTitle>
        </DialogHeader>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground">Status</p>
            <Badge variant={isRunning ? 'default' : 'secondary'} className="mt-0.5 text-[10px]">
              {isRunning ? 'Enviando' : campaign.status === 'paused' ? 'Pausada' : campaign.status === 'completed' ? 'Concluída' : campaign.status === 'canceled' ? 'Cancelada' : 'Rascunho'}
            </Badge>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground">Enviadas</p>
            <p className="text-lg font-bold text-emerald-600">{sent}</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground">Falhas</p>
            <p className="text-lg font-bold text-rose-600">{failed}</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground">Tempo rest.</p>
            <p className="text-lg font-bold">{formatBroadcastInterval(estimatedRemaining)}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{sent} de {total}</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        {/* Counter badges */}
        <div className="flex gap-2 flex-wrap text-xs">
          <Badge variant="outline" className="border-emerald-200 text-emerald-700">
            <Check className="mr-1 h-3 w-3" /> {sent} Enviados
          </Badge>
          <Badge variant="outline" className="border-rose-200 text-rose-700">
            <X className="mr-1 h-3 w-3" /> {failed} Falhas
          </Badge>
          <Badge variant="outline">
            <Clock className="mr-1 h-3 w-3" /> {pending} Pendentes
          </Badge>
        </div>

        {/* Recipients list */}
        <ScrollArea className="flex-1 min-h-0 rounded border">
          <div className="divide-y">
            {recipients.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Nenhum destinatário</p>
            ) : (
              recipients.map((r) => (
                <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  {STATUS_ICON[r.status] || STATUS_ICON.pending}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.recipient_name || r.recipient_phone}</p>
                    {r.recipient_name && (
                      <p className="text-xs text-muted-foreground">{r.recipient_phone}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {STATUS_LABEL[r.status] || r.status}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2">
          {(campaign.status === 'draft' || campaign.status === 'paused') && (
            <Button size="sm" onClick={() => void onUpdateStatus(campaign.id, 'running')}>
              <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
              {campaign.status === 'paused' ? 'Retomar' : 'Iniciar'}
            </Button>
          )}
          {isRunning && (
            <>
              <Button variant="outline" size="sm" onClick={() => void onUpdateStatus(campaign.id, 'paused')}>
                <PauseCircle className="mr-1.5 h-3.5 w-3.5" /> Pausar
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void onUpdateStatus(campaign.id, 'canceled')}>
                <Ban className="mr-1.5 h-3.5 w-3.5" /> Cancelar
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
