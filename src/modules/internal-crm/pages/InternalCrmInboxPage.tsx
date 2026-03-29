import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, PanelRightOpen, PlugZap, QrCode, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { InternalCrmActionsPanel } from '@/modules/internal-crm/components/inbox/InternalCrmActionsPanel';
import { InternalCrmChatArea } from '@/modules/internal-crm/components/inbox/InternalCrmChatArea';
import { InternalCrmConversationActionsSheet } from '@/modules/internal-crm/components/inbox/InternalCrmConversationActionsSheet';
import { InternalCrmConversationList } from '@/modules/internal-crm/components/inbox/InternalCrmConversationList';
import { useInternalCrmInbox } from '@/modules/internal-crm/hooks/useInternalCrmInbox';
import { useInternalCrmMutation } from '@/modules/internal-crm/hooks/useInternalCrmApi';

export default function InternalCrmInboxPage() {
  const { toast } = useToast();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | 'open' | 'resolved' | 'archived'>('open');
  const [search, setSearch] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [instanceDialogOpen, setInstanceDialogOpen] = useState(false);
  const [actionsSheetOpen, setActionsSheetOpen] = useState(false);
  const [instanceDraft, setInstanceDraft] = useState({
    instance_name: '',
    display_name: '',
    ai_enabled: false,
  });
  const autoReadSignatureRef = useRef<string>('');

  const inbox = useInternalCrmInbox(selectedConversationId, { status });
  const conversations = inbox.conversationsQuery.data?.conversations || [];
  const selectedClientId = inbox.selectedClientId;
  const unreadInboundSignature = useMemo(() => {
    if (!selectedConversationId) return '';

    const unreadInboundIds = inbox.messages
      .filter((message) => message.direction === 'inbound' && !message.read_at)
      .map((message) => message.id)
      .sort();

    return unreadInboundIds.length > 0 ? `${selectedConversationId}:${unreadInboundIds.join('|')}` : '';
  }, [inbox.messages, selectedConversationId]);

  const provisionMutation = useInternalCrmMutation({
    invalidate: [['internal-crm', 'client-detail'], ['internal-crm', 'clients'], ['internal-crm', 'dashboard']],
  });

  useEffect(() => {
    if (conversations.length === 0) {
      setSelectedConversationId(null);
      return;
    }

    if (!selectedConversationId) {
      setSelectedConversationId(conversations[0].id);
      return;
    }

    const existsInCurrentStatus = conversations.some((conversation) => conversation.id === selectedConversationId);
    if (!existsInCurrentStatus) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (!unreadInboundSignature || !selectedConversationId || !inbox.conversationDetailQuery.isSuccess) {
      return;
    }

    if (autoReadSignatureRef.current === unreadInboundSignature) {
      return;
    }

    autoReadSignatureRef.current = unreadInboundSignature;
    void inbox.markConversationReadMutation.mutateAsync({
      action: 'mark_conversation_read',
      conversation_id: selectedConversationId,
    }).catch(() => {
      autoReadSignatureRef.current = '';
    });
  }, [inbox.conversationDetailQuery.isSuccess, inbox.markConversationReadMutation, selectedConversationId, unreadInboundSignature]);

  useEffect(() => {
    if (!selectedConversationId) {
      autoReadSignatureRef.current = '';
    }
  }, [selectedConversationId]);

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

  const updateConversationStatus = async (nextStatus: 'open' | 'resolved' | 'archived') => {
    if (!selectedConversationId) return;

    await inbox.updateConversationStatusMutation.mutateAsync({
      action: 'update_conversation_status',
      conversation_id: selectedConversationId,
      status: nextStatus,
    });

    setActionsSheetOpen(false);
    toast({
      title: 'Status atualizado',
      description: `A conversa foi movida para ${nextStatus === 'open' ? 'aberta' : nextStatus === 'resolved' ? 'resolvida' : 'arquivada'}.`,
    });
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

  const handleProvision = async (dealId?: string) => {
    if (!selectedClientId) return;

    await provisionMutation.mutateAsync({
      action: 'provision_customer',
      client_id: selectedClientId,
      deal_id: dealId,
    });

    toast({
      title: 'Provisionamento acionado',
      description: 'A conta SolarZap vinculada foi colocada na fila de provisionamento.',
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[30px] border border-border/70 bg-card/95 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Inbox comercial interno</p>
              <p className="text-xs text-muted-foreground">
                Workspace de conversa espelhado na aba Conversas, adaptado ao contexto do CRM interno.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {inbox.selectedConversation ? (
              <Button variant="outline" className="xl:hidden" onClick={() => setActionsSheetOpen(true)}>
                <PanelRightOpen className="mr-2 h-4 w-4" />
                Ações
              </Button>
            ) : null}
            <Button onClick={() => setInstanceDialogOpen(true)}>
              <PlugZap className="mr-2 h-4 w-4" />
              Nova instância interna
            </Button>
          </div>
        </div>

        <div className="grid h-[calc(100vh-11rem)] min-h-[680px] grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_360px]">
          <div className={cn('min-h-0 border-r border-border/70', selectedConversationId ? 'hidden lg:block' : 'block')}>
            <InternalCrmConversationList
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              onSelectConversation={setSelectedConversationId}
              search={search}
              onSearchChange={setSearch}
              status={status}
              onStatusChange={(value) => setStatus(value as 'all' | 'open' | 'resolved' | 'archived')}
              isLoading={inbox.conversationsQuery.isLoading}
            />
          </div>

          <div className={cn('min-h-0', !selectedConversationId ? 'hidden lg:block' : 'block')}>
            <InternalCrmChatArea
              conversation={inbox.selectedConversation}
              messages={inbox.messages}
              instance={inbox.selectedInstance}
              messageBody={messageBody}
              onMessageBodyChange={setMessageBody}
              onSendMessage={sendMessage}
              isSending={inbox.appendMessageMutation.isPending}
              isUpdatingStatus={inbox.updateConversationStatusMutation.isPending}
              onUpdateStatus={updateConversationStatus}
              onOpenActions={() => setActionsSheetOpen(true)}
              onBack={() => setSelectedConversationId(null)}
            />
          </div>

          <div className="hidden min-h-0 border-l border-border/70 xl:block">
            <InternalCrmActionsPanel
              conversation={inbox.selectedConversation}
              detail={inbox.clientDetailQuery.data || null}
              instance={inbox.selectedInstance}
              onUpdateStatus={updateConversationStatus}
              onProvision={handleProvision}
              onConnectInstance={() => {
                if (!inbox.selectedInstance?.id) return;
                void connectInstance(inbox.selectedInstance.id);
              }}
              onOpenInstanceDialog={() => setInstanceDialogOpen(true)}
              isProvisioning={provisionMutation.isPending}
              isUpdatingStatus={inbox.updateConversationStatusMutation.isPending}
              isConnectingInstance={inbox.connectInstanceMutation.isPending}
            />
          </div>
        </div>
      </div>

      <InternalCrmConversationActionsSheet
        open={actionsSheetOpen}
        onOpenChange={setActionsSheetOpen}
        conversation={inbox.selectedConversation}
        detail={inbox.clientDetailQuery.data || null}
        instance={inbox.selectedInstance}
        onUpdateStatus={updateConversationStatus}
        onProvision={handleProvision}
        onConnectInstance={() => {
          if (!inbox.selectedInstance?.id) return;
          void connectInstance(inbox.selectedInstance.id);
        }}
        onOpenInstanceDialog={() => setInstanceDialogOpen(true)}
        isProvisioning={provisionMutation.isPending}
        isUpdatingStatus={inbox.updateConversationStatusMutation.isPending}
        isConnectingInstance={inbox.connectInstanceMutation.isPending}
      />
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

          {inbox.instancesQuery.data?.instances?.length ? (
            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Instâncias existentes</p>
                  <p className="text-xs text-muted-foreground">Conecte uma instância já cadastrada sem sair da Inbox.</p>
                </div>
              </div>

              <div className="space-y-2">
                {inbox.instancesQuery.data.instances.map((instance) => (
                  <div key={instance.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{instance.display_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{instance.instance_name}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void connectInstance(instance.id)}>
                      <QrCode className="mr-1.5 h-4 w-4" />
                      Conectar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

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
