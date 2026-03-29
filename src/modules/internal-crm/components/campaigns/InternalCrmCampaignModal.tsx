import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { InternalCrmRecipientSelector } from '@/modules/internal-crm/components/campaigns/InternalCrmRecipientSelector';
import type { InternalCrmCampaign, InternalCrmWhatsappInstance } from '@/modules/internal-crm/types';

export type InternalCrmCampaignSavePayload = {
  campaign_id?: string;
  name: string;
  whatsapp_instance_id: string | null;
  messages: string[];
  recipients: Array<{
    recipient_name: string | null;
    recipient_phone: string;
    client_id?: string;
  }>;
  status: InternalCrmCampaign['status'];
};

type InternalCrmCampaignModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instances: InternalCrmWhatsappInstance[];
  campaign: InternalCrmCampaign | null;
  isSubmitting: boolean;
  onSave: (payload: InternalCrmCampaignSavePayload) => Promise<void>;
};

function parseRecipients(rawValue: string): InternalCrmCampaignSavePayload['recipients'] {
  return rawValue
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [recipientName, recipientPhone, clientId] = line.split(';').map((part) => part.trim());
      return {
        recipient_name: recipientName || null,
        recipient_phone: recipientPhone || '',
        ...(clientId ? { client_id: clientId } : {}),
      };
    })
    .filter((item) => item.recipient_phone.length > 0);
}

export function InternalCrmCampaignModal(props: InternalCrmCampaignModalProps) {
  const [name, setName] = useState('');
  const [instanceId, setInstanceId] = useState('none');
  const [status, setStatus] = useState<InternalCrmCampaign['status']>('draft');
  const [messagesText, setMessagesText] = useState('');
  const [recipientsText, setRecipientsText] = useState('');

  useEffect(() => {
    if (!props.open) return;

    setName(props.campaign?.name || '');
    setInstanceId(props.campaign?.whatsapp_instance_id || 'none');
    setStatus(props.campaign?.status || 'draft');
    setMessagesText((props.campaign?.messages || []).join('\n'));
    setRecipientsText('');
  }, [props.campaign, props.open]);

  const messages = useMemo(
    () => messagesText.split('\n').map((line) => line.trim()).filter(Boolean),
    [messagesText],
  );

  const canSave = name.trim().length > 2 && messages.length > 0 && !props.isSubmitting;

  async function handleSubmit() {
    if (!canSave) return;

    await props.onSave({
      campaign_id: props.campaign?.id,
      name: name.trim(),
      whatsapp_instance_id: instanceId === 'none' ? null : instanceId,
      messages,
      recipients: parseRecipients(recipientsText),
      status,
    });
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{props.campaign ? 'Editar campanha' : 'Nova campanha interna'}</DialogTitle>
          <DialogDescription>
            Configure mensagens e audiencia para disparos internos no WhatsApp dedicado do CRM.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Reativacao de leads frios" />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Instancia WhatsApp</Label>
              <Select value={instanceId} onValueChange={setInstanceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a instancia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem instancia</SelectItem>
                  {props.instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as InternalCrmCampaign['status'])}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="running">Rodando</SelectItem>
                  <SelectItem value="paused">Pausada</SelectItem>
                  <SelectItem value="completed">Concluida</SelectItem>
                  <SelectItem value="canceled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mensagens (uma por linha)</Label>
            <Textarea
              rows={4}
              value={messagesText}
              onChange={(event) => setMessagesText(event.target.value)}
              placeholder={['Ola {{name}}, tudo bem?', 'Vi que voce testou o SolarZap e posso te ajudar no setup.'].join('\n')}
            />
          </div>

          <InternalCrmRecipientSelector value={recipientsText} onChange={setRecipientsText} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSave}>
            Salvar campanha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
