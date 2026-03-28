import { useState } from 'react';
import { Megaphone, PauseCircle, PlayCircle, Plus, Save } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  internalCrmQueryKeys,
  useInternalCrmCampaigns,
  useInternalCrmInstances,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import { TokenBadge } from '@/modules/internal-crm/components/InternalCrmUi';

export default function InternalCrmCampaignsPage() {
  const { toast } = useToast();
  const campaignsQuery = useInternalCrmCampaigns();
  const instancesQuery = useInternalCrmInstances();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    whatsapp_instance_id: '',
    messages: '',
    recipients: '',
  });

  const campaignMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.campaigns()],
    onSuccess: async () => {
      toast({ title: 'Campanha salva', description: 'A campanha interna foi registrada.' });
      setDialogOpen(false);
      setDraft({ name: '', whatsapp_instance_id: '', messages: '', recipients: '' });
    },
  });

  const statusMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.campaigns()],
    onSuccess: async () => {
      toast({ title: 'Status atualizado', description: 'O worker passara a respeitar o novo estado da campanha.' });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanhas"
        subtitle="Disparos internos separados das campanhas dos tenants."
        icon={Megaphone}
        actionContent={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova campanha
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(campaignsQuery.data?.campaigns || []).map((campaign) => (
          <Card key={campaign.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>{campaign.name}</span>
                <TokenBadge token={campaign.status} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {campaign.messages.length} mensagem(ns) configuradas. Enviados: {campaign.sent_count} · Falhas: {campaign.failed_count}
              </p>
              <div className="flex flex-wrap gap-2">
                {campaign.status === 'running' ? (
                  <Button variant="outline" size="sm" onClick={() => statusMutation.mutate({ action: 'update_campaign_status', campaign_id: campaign.id, status: 'paused' })}>
                    <PauseCircle className="mr-2 h-4 w-4" />
                    Pausar
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => statusMutation.mutate({ action: 'update_campaign_status', campaign_id: campaign.id, status: 'running' })}>
                    <PlayCircle className="mr-2 h-4 w-4" />
                    Iniciar
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => statusMutation.mutate({ action: 'update_campaign_status', campaign_id: campaign.id, status: 'canceled' })}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova campanha interna</DialogTitle>
            <DialogDescription>Cadastre o nome, a instancia e os destinatarios para o worker dedicado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>ID da instancia</Label>
              <Input value={draft.whatsapp_instance_id} onChange={(event) => setDraft((current) => ({ ...current, whatsapp_instance_id: event.target.value }))} placeholder={instancesQuery.data?.instances[0]?.id || 'Cole o id da instancia'} />
            </div>
            <div className="space-y-2">
              <Label>Mensagens (uma por linha)</Label>
              <Textarea rows={4} value={draft.messages} onChange={(event) => setDraft((current) => ({ ...current, messages: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Destinatarios (nome;telefone por linha)</Label>
              <Textarea rows={5} value={draft.recipients} onChange={(event) => setDraft((current) => ({ ...current, recipients: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() =>
                campaignMutation.mutate({
                  action: 'upsert_campaign',
                  name: draft.name,
                  whatsapp_instance_id: draft.whatsapp_instance_id || null,
                  messages: draft.messages.split('\n').map((line) => line.trim()).filter(Boolean),
                  recipients: draft.recipients
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const [recipientName, recipientPhone] = line.split(';');
                      return { recipient_name: recipientName?.trim(), recipient_phone: recipientPhone?.trim() };
                    }),
                })
              }
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar campanha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
