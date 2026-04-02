import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { InternalCrmActionsPanelFull } from '@/modules/internal-crm/components/inbox/InternalCrmActionsPanelFull';
import { InternalCrmChatAreaFull } from '@/modules/internal-crm/components/inbox/InternalCrmChatAreaFull';
import { InternalCrmConversationActionsSheet } from '@/modules/internal-crm/components/inbox/InternalCrmConversationActionsSheet';
import { InternalCrmConversationList } from '@/modules/internal-crm/components/inbox/InternalCrmConversationList';
import { ClientNotesSheet } from '@/modules/internal-crm/components/inbox/ClientNotesSheet';
import { InternalCrmAppointmentModal } from '@/modules/internal-crm/components/calendar/InternalCrmAppointmentModal';
import { useInternalCrmInbox } from '@/modules/internal-crm/hooks/useInternalCrmInbox';
import { useInternalCrmClients, useInternalCrmMutation } from '@/modules/internal-crm/hooks/useInternalCrmApi';

export default function InternalCrmInboxPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | 'open' | 'resolved' | 'archived'>('open');
  const [search, setSearch] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [actionsSheetOpen, setActionsSheetOpen] = useState(false);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(true);
  const [notesSheetOpen, setNotesSheetOpen] = useState(false);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const autoReadSignatureRef = useRef<string>('');

  const inbox = useInternalCrmInbox(selectedConversationId, { status });
  const conversations = useMemo(
    () => inbox.conversationsQuery.data?.conversations ?? [],
    [inbox.conversationsQuery.data?.conversations],
  );
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

  useEffect(() => {
    const requestedConversationId = searchParams.get('conversation');
    if (!requestedConversationId) return;

    if (status !== 'all') {
      setStatus('all');
      return;
    }

    const matchedConversation = conversations.find((conversation) => conversation.id === requestedConversationId);
    if (!matchedConversation) return;

    setSelectedConversationId(requestedConversationId);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('conversation');
    setSearchParams(nextParams, { replace: true });
  }, [conversations, searchParams, setSearchParams, status]);

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

  const sendAttachment = async (file: File, fileType: string) => {
    if (!selectedConversationId) return;
    // Upload file to Supabase Storage first
    const ext = file.name.split('.').pop() || 'bin';
    const path = `internal-crm/attachments/${selectedConversationId}/${Date.now()}.${ext}`;
    const { data: uploadData, error: uploadError } = await inbox.supabaseClient.storage
      .from('internal-crm-media')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadError || !uploadData?.path) {
      toast({ title: 'Erro ao enviar arquivo', description: uploadError?.message || 'Falha no upload.', variant: 'destructive' });
      return;
    }
    const { data: { publicUrl } } = inbox.supabaseClient.storage.from('internal-crm-media').getPublicUrl(uploadData.path);
    await inbox.appendMessageMutation.mutateAsync({
      action: 'append_message',
      conversation_id: selectedConversationId,
      body: fileType === 'image' ? '' : file.name,
      message_type: fileType,
      attachment_url: publicUrl,
      file_name: file.name,
    });
  };

  const saveClient = async (fields: Record<string, unknown>) => {
    if (!selectedClientId) return;
    await inbox.upsertClientMutation.mutateAsync({
      action: 'upsert_client',
      client_id: selectedClientId,
      ...fields,
    });
    toast({ title: 'Cliente atualizado' });
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
    const targetClientId = selectedClientId || inbox.selectedConversation?.client_id || '';
    navigate(targetClientId ? `/admin/crm/pipeline?client=${targetClientId}` : '/admin/crm/pipeline');
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="Inbox"
        subtitle="Converse com leads e clientes sem sair do fluxo operacional do CRM."
        icon={MessageSquare}
        mobileToolbar={
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
            {conversations.length} conversa{conversations.length === 1 ? '' : 's'}
          </Badge>
        }
        actionContent={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
              {conversations.length} conversa{conversations.length === 1 ? '' : 's'}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-xs capitalize">
              {status === 'all' ? 'Todas' : status === 'open' ? 'Abertas' : status === 'resolved' ? 'Resolvidas' : 'Arquivadas'}
            </Badge>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-border/60 bg-card/88 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.24)] backdrop-blur-sm">
        <div className={cn(
          'grid h-full min-h-0 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]',
          isDetailsPanelOpen && 'xl:grid-cols-[320px_minmax(0,1fr)_340px]',
        )}>
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

          {/* Chat area — full version */}
          <div className={cn('min-h-0 border-l border-border/40', !selectedConversationId ? 'hidden lg:block' : 'block')}>
            <InternalCrmChatAreaFull
              conversation={inbox.selectedConversation}
              messages={inbox.messages}
              instance={inbox.selectedInstance}
              messageBody={messageBody}
              onMessageBodyChange={setMessageBody}
              onSendMessage={sendMessage}
              onSendAttachment={sendAttachment}
              isSending={inbox.appendMessageMutation.isPending}
              isUpdatingStatus={inbox.updateConversationStatusMutation.isPending}
              onUpdateStatus={updateConversationStatus}
              onOpenActions={() => {
                // On xl+ toggle the right panel; on smaller screens open sheet
                if (window.innerWidth >= 1280) {
                  setIsDetailsPanelOpen((p) => !p);
                } else {
                  setActionsSheetOpen(true);
                }
              }}
              onBack={() => setSelectedConversationId(null)}
              isDetailsPanelOpen={isDetailsPanelOpen}
            />
          </div>

          {/* Actions panel (desktop) — full version */}
          {isDetailsPanelOpen && (
            <div className="hidden min-h-0 border-l border-border/40 xl:block">
              <InternalCrmActionsPanelFull
                conversation={inbox.selectedConversation}
                detail={inbox.clientDetailQuery.data || null}
                onClose={() => setIsDetailsPanelOpen(false)}
                onSaveClient={saveClient}
                onScheduleMeeting={() => setAppointmentModalOpen(true)}
                onScheduleCall={() => setAppointmentModalOpen(true)}
                onOpenComments={() => setNotesSheetOpen(true)}
                onNavigatePipeline={navigatePipeline}
              />
            </div>
          )}
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
