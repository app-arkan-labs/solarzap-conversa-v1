import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { InternalCrmActionsPanel } from '@/modules/internal-crm/components/inbox/InternalCrmActionsPanel';
import { InternalCrmChatArea } from '@/modules/internal-crm/components/inbox/InternalCrmChatArea';
import { InternalCrmConversationActionsSheet } from '@/modules/internal-crm/components/inbox/InternalCrmConversationActionsSheet';
import { InternalCrmConversationList } from '@/modules/internal-crm/components/inbox/InternalCrmConversationList';
import { ClientNotesSheet } from '@/modules/internal-crm/components/inbox/ClientNotesSheet';
import { InternalCrmAppointmentModal } from '@/modules/internal-crm/components/calendar/InternalCrmAppointmentModal';
import { useInternalCrmInbox } from '@/modules/internal-crm/hooks/useInternalCrmInbox';
import { useInternalCrmClients, useInternalCrmMutation } from '@/modules/internal-crm/hooks/useInternalCrmApi';

export default function InternalCrmInboxPage() {
  const { toast } = useToast();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | 'open' | 'resolved' | 'archived'>('open');
  const [search, setSearch] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [actionsSheetOpen, setActionsSheetOpen] = useState(false);
  const [notesSheetOpen, setNotesSheetOpen] = useState(false);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const autoReadSignatureRef = useRef<string>('');

  const inbox = useInternalCrmInbox(selectedConversationId, { status });
  const conversations = inbox.conversationsQuery.data?.conversations || [];
  const selectedClientId = inbox.selectedClientId;
  const clientsQuery = useInternalCrmClients();
  const clients = clientsQuery.data?.clients || [];

  const unreadInboundSignature = useMemo(() => {
    if (!selectedConversationId) return '';
    const unreadInboundIds = inbox.messages
      .filter((message) => message.direction === 'inbound' && !message.read_at)
      .map((message) => message.id)
      .sort();
    return unreadInboundIds.length > 0 ? `${selectedConversationId}:${unreadInboundIds.join('|')}` : '';
  }, [inbox.messages, selectedConversationId]);

  const appointmentMutation = useInternalCrmMutation({
    invalidate: [['internal-crm', 'client-detail'], ['internal-crm', 'appointments']],
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
    const existsInCurrentStatus = conversations.some((c) => c.id === selectedConversationId);
    if (!existsInCurrentStatus) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (!unreadInboundSignature || !selectedConversationId || !inbox.conversationDetailQuery.isSuccess) return;
    if (autoReadSignatureRef.current === unreadInboundSignature) return;
    autoReadSignatureRef.current = unreadInboundSignature;
    void inbox.markConversationReadMutation.mutateAsync({
      action: 'mark_conversation_read',
      conversation_id: selectedConversationId,
    }).catch(() => { autoReadSignatureRef.current = ''; });
  }, [inbox.conversationDetailQuery.isSuccess, inbox.markConversationReadMutation, selectedConversationId, unreadInboundSignature]);

  useEffect(() => {
    if (!selectedConversationId) autoReadSignatureRef.current = '';
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
  };

  const sendNote = async (body: string) => {
    if (!selectedConversationId) return;
    await inbox.appendMessageMutation.mutateAsync({
      action: 'append_message',
      conversation_id: selectedConversationId,
      body,
      message_type: 'note',
    });
    toast({ title: 'Nota adicionada' });
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
      description: nextStatus === 'open' ? 'Conversa reaberta.' : nextStatus === 'resolved' ? 'Conversa resolvida.' : 'Conversa arquivada.',
    });
  };

  const saveAppointment = async (payload: Record<string, unknown>) => {
    await appointmentMutation.mutateAsync({
      action: 'upsert_appointment',
      ...payload,
      client_id: selectedClientId || payload.client_id,
    });
    toast({ title: 'Reunião agendada' });
    setAppointmentModalOpen(false);
  };

  const navigatePipeline = () => {
    // Navigate to pipeline tab — trigger parent tab change
    const pipelineTab = document.querySelector('[data-tab-value="pipeline"]') as HTMLElement | null;
    if (pipelineTab) pipelineTab.click();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden">
        {/* Simplified header */}
        <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Conversas</p>
            <p className="text-xs text-muted-foreground">Inbox do CRM interno</p>
          </div>
        </div>

        {/* 3-column layout */}
        <div className="grid h-[calc(100vh-11rem)] min-h-[600px] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_340px]">
          {/* Conversation list */}
          <div className={cn('min-h-0', selectedConversationId ? 'hidden lg:block' : 'block')}>
            <InternalCrmConversationList
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              onSelectConversation={setSelectedConversationId}
              search={search}
              onSearchChange={setSearch}
              status={status}
              onStatusChange={(v) => setStatus(v as 'all' | 'open' | 'resolved' | 'archived')}
              isLoading={inbox.conversationsQuery.isLoading}
            />
          </div>

          {/* Chat area */}
          <div className={cn('min-h-0 border-l border-border/40', !selectedConversationId ? 'hidden lg:block' : 'block')}>
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

          {/* Actions panel (desktop) */}
          <div className="hidden min-h-0 border-l border-border/40 xl:block">
            <InternalCrmActionsPanel
              conversation={inbox.selectedConversation}
              detail={inbox.clientDetailQuery.data || null}
              onUpdateStatus={updateConversationStatus}
              onScheduleMeeting={() => setAppointmentModalOpen(true)}
              onOpenComments={() => setNotesSheetOpen(true)}
              onNavigatePipeline={navigatePipeline}
              isUpdatingStatus={inbox.updateConversationStatusMutation.isPending}
            />
          </div>
        </div>
      </div>

      {/* Mobile actions sheet */}
      <InternalCrmConversationActionsSheet
        open={actionsSheetOpen}
        onOpenChange={setActionsSheetOpen}
        conversation={inbox.selectedConversation}
        detail={inbox.clientDetailQuery.data || null}
        onUpdateStatus={updateConversationStatus}
        onScheduleMeeting={() => setAppointmentModalOpen(true)}
        onOpenComments={() => setNotesSheetOpen(true)}
        onNavigatePipeline={navigatePipeline}
        isUpdatingStatus={inbox.updateConversationStatusMutation.isPending}
      />

      {/* Notes sheet */}
      <ClientNotesSheet
        open={notesSheetOpen}
        onOpenChange={setNotesSheetOpen}
        messages={inbox.messages}
        onSendNote={sendNote}
        isSending={inbox.appendMessageMutation.isPending}
      />

      {/* Appointment modal */}
      <InternalCrmAppointmentModal
        open={appointmentModalOpen}
        onOpenChange={setAppointmentModalOpen}
        appointment={null}
        clients={clients}
        defaultStartAt={new Date().toISOString()}
        isSubmitting={appointmentMutation.isPending}
        onSave={saveAppointment}
      />
    </div>
  );
}
