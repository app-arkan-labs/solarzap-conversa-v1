import { useState } from 'react';
import { MessageSquare, PlugZap, QrCode, Save } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { InternalCrmActionsPanel } from '@/modules/internal-crm/components/inbox/InternalCrmActionsPanel';
import { InternalCrmChatArea } from '@/modules/internal-crm/components/inbox/InternalCrmChatArea';
import { InternalCrmConversationList } from '@/modules/internal-crm/components/inbox/InternalCrmConversationList';
import { useInternalCrmInbox } from '@/modules/internal-crm/hooks/useInternalCrmInbox';
import { useInternalCrmClientDetail, useInternalCrmMutation } from '@/modules/internal-crm/hooks/useInternalCrmApi';

export default function InternalCrmInboxPage() {
  const { toast } = useToast();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | 'open' | 'resolved' | 'archived'>('open');
  const [search, setSearch] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [instanceDialogOpen, setInstanceDialogOpen] = useState(false);
  const [instanceDraft, setInstanceDraft] = useState({
    instance_name: '',
    display_name: '',
    ai_enabled: false,
  });

  const inbox = useInternalCrmInbox(selectedConversationId, { status });
  const selectedClientId = inbox.selectedConversation?.client_id || null;
  const clientDetailQuery = useInternalCrmClientDetail(selectedClientId);

  const provisionMutation = useInternalCrmMutation({
    invalidate: [['internal-crm', 'client-detail'], ['internal-crm', 'clients'], ['internal-crm', 'dashboard']],
  });

  const sendMessage = async () => {
    if (!selectedConversationId || !messageBody.trim()) return;

    await inbox.appendMessageMutation.mutateAsync({
      action: 'append_message',
      conversation_id: selectedConversationId,
      body: messageBody,
      message_type: inbox.selectedConversation?.channel === 'manual_note' ? 'note' : 'text',
    });

    setMessageBody('');
    toast({ title: 'Mensagem enviada', description: 'A conversa foi atualizada no inbox interno.' });
  };

  const saveInstance = async () => {
    await inbox.upsertInstanceMutation.mutateAsync({
      action: 'upsert_instance',
      ...instanceDraft,
    });

    toast({ title: 'Instância salva', description: 'A instância interna foi registrada no CRM.' });
    setInstanceDialogOpen(false);
    setInstanceDraft({ instance_name: '', display_name: '', ai_enabled: false });
  };

  const connectInstance = async (instanceId: string) => {
    const response = await inbox.connectInstanceMutation.mutateAsync({
      action: 'connect_instance',
      instance_id: instanceId,
    });

    const hasQr = String((response as { qr_code_base64?: string })?.qr_code_base64 || '').trim().length > 0;
    toast({
      title: 'Instância atualizada',
      description: hasQr ? 'QR code pronto para conexão no WhatsApp.' : 'Estado da instância sincronizado.',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        subtitle="Relacionamento comercial interno com a mesma fluidez da aba Conversas."
        icon={MessageSquare}
        actionContent={
          <Button onClick={() => setInstanceDialogOpen(true)}>
            <PlugZap className="mr-2 h-4 w-4" />
            Nova instância interna
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr_0.9fr]">
        <InternalCrmConversationList
          conversations={inbox.conversationsQuery.data?.conversations || []}
          selectedConversationId={selectedConversationId}
          onSelectConversation={setSelectedConversationId}
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={(value) => setStatus(value as 'all' | 'open' | 'resolved' | 'archived')}
        />

        <InternalCrmChatArea
          conversation={inbox.selectedConversation}
          messages={inbox.conversationDetailQuery.data?.messages || []}
          instance={inbox.selectedInstance}
          messageBody={messageBody}
          onMessageBodyChange={setMessageBody}
          onSendMessage={sendMessage}
          isSending={inbox.appendMessageMutation.isPending}
        />

        <InternalCrmActionsPanel
          detail={clientDetailQuery.data || null}
          onProvision={(dealId) => {
            if (!selectedClientId) return;
            void provisionMutation.mutateAsync({
              action: 'provision_customer',
              client_id: selectedClientId,
              deal_id: dealId,
            });
          }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instâncias internas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(inbox.instancesQuery.data?.instances || []).map((instance) => (
            <div key={instance.id} className="rounded-2xl border border-border/70 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{instance.display_name}</p>
                  <p className="text-xs text-muted-foreground">{instance.instance_name}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void connectInstance(instance.id)}>
                  <QrCode className="mr-1.5 h-4 w-4" />
                  Conectar
                </Button>
              </div>
              {instance.qr_code_base64 ? (
                <div className="mt-3 rounded-xl border border-border/70 bg-white p-3">
                  <img src={instance.qr_code_base64} alt={`QR ${instance.display_name}`} className="mx-auto h-40 w-40 object-contain" />
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={instanceDialogOpen} onOpenChange={setInstanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova instância interna</DialogTitle>
            <DialogDescription>
              Cadastre uma instância dedicada ao CRM interno com prefixo sz_internal_.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome técnico</Label>
              <Input
                value={instanceDraft.instance_name}
                onChange={(event) => setInstanceDraft((current) => ({ ...current, instance_name: event.target.value }))}
                placeholder="ex: vendas_norte"
              />
            </div>
            <div className="space-y-2">
              <Label>Nome de exibição</Label>
              <Input
                value={instanceDraft.display_name}
                onChange={(event) => setInstanceDraft((current) => ({ ...current, display_name: event.target.value }))}
                placeholder="WhatsApp Comercial SolarZap"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInstanceDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveInstance()} disabled={inbox.upsertInstanceMutation.isPending}>
              <Save className="mr-1.5 h-4 w-4" />
              Salvar instância
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
