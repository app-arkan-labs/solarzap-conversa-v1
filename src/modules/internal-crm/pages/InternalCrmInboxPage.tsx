import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { InternalCrmActionsPanelFull } from '@/modules/internal-crm/components/inbox/InternalCrmActionsPanelFull';
import { InternalCrmChatAreaFull } from '@/modules/internal-crm/components/inbox/InternalCrmChatAreaFull';
import { InternalCrmConversationActionsSheet } from '@/modules/internal-crm/components/inbox/InternalCrmConversationActionsSheet';
import { InternalCrmConversationList } from '@/modules/internal-crm/components/inbox/InternalCrmConversationList';
import { ClientNotesSheet } from '@/modules/internal-crm/components/inbox/ClientNotesSheet';
import { InternalCrmAppointmentModal } from '@/modules/internal-crm/components/calendar/InternalCrmAppointmentModal';
import { buildAutoDealTitle, getOpenDealsForClient } from '@/modules/internal-crm/lib/commercialFlow';
import { useInternalCrmInbox } from '@/modules/internal-crm/hooks/useInternalCrmInbox';
import { useInternalCrmClients, useInternalCrmMutation } from '@/modules/internal-crm/hooks/useInternalCrmApi';
import type { InternalCrmAttachmentKind, InternalCrmMediaVariant } from '@/modules/internal-crm/lib/chatMedia';

const INBOX_LEAD_LIST_WIDTH_STORAGE_KEY = 'internal_crm_inbox_lead_list_width';
const INBOX_LEAD_LIST_WIDTH_MIN = 300;
const INBOX_LEAD_LIST_WIDTH_MAX = 520;
const INBOX_LEAD_LIST_WIDTH_DEFAULT = 360;

export default function InternalCrmInboxPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [instanceFilter, setInstanceFilter] = useState('all');
  const [messageBody, setMessageBody] = useState('');
  const [actionsSheetOpen, setActionsSheetOpen] = useState(false);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const [leadListWidth, setLeadListWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return INBOX_LEAD_LIST_WIDTH_DEFAULT;
    const raw = window.localStorage.getItem(INBOX_LEAD_LIST_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number(raw) : Number.NaN;
    if (!Number.isFinite(parsed)) return INBOX_LEAD_LIST_WIDTH_DEFAULT;
    return Math.min(INBOX_LEAD_LIST_WIDTH_MAX, Math.max(INBOX_LEAD_LIST_WIDTH_MIN, parsed));
  });
  const [isResizingLeadList, setIsResizingLeadList] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  const [notesSheetOpen, setNotesSheetOpen] = useState(false);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const autoReadSignatureRef = useRef<string>('');
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const inbox = useInternalCrmInbox(selectedConversationId, {});
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
  const upsertDealMutation = useInternalCrmMutation({
    invalidate: [['internal-crm', 'deals'], ['internal-crm', 'client-detail'], ['internal-crm', 'appointments']],
  });

  useEffect(() => {
    const selectableConversations = conversations.filter((conversation) => conversation.status !== 'archived');
    if (selectableConversations.length === 0) {
      setSelectedConversationId(null);
      return;
    }
    if (!selectedConversationId) {
      setSelectedConversationId(selectableConversations[0].id);
      return;
    }
    const existsInCurrentStatus = selectableConversations.some((c) => c.id === selectedConversationId);
    if (!existsInCurrentStatus) {
      setSelectedConversationId(selectableConversations[0].id);
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

    const matchedConversation = conversations.find((conversation) => conversation.id === requestedConversationId);
    if (!matchedConversation) return;

    setSelectedConversationId(requestedConversationId);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('conversation');
    setSearchParams(nextParams, { replace: true });
  }, [conversations, searchParams, setSearchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(INBOX_LEAD_LIST_WIDTH_STORAGE_KEY, String(leadListWidth));
  }, [leadListWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 1024px)');
    const updateViewport = (matches: boolean) => {
      setIsDesktopViewport(matches);
      if (!matches) {
        setIsResizingLeadList(false);
      }
    };

    updateViewport(media.matches);

    const onChange = (event: MediaQueryListEvent) => updateViewport(event.matches);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  useEffect(() => {
    if (!isResizingLeadList) return;

    const handleMouseMove = (event: MouseEvent) => {
      const container = workspaceRef.current;
      if (!container) return;
      const left = container.getBoundingClientRect().left;
      const maxByViewport = Math.floor(container.clientWidth * 0.4);
      const maxAllowed = Math.min(INBOX_LEAD_LIST_WIDTH_MAX, Math.max(INBOX_LEAD_LIST_WIDTH_MIN, maxByViewport));
      const nextWidth = event.clientX - left;
      setLeadListWidth(Math.min(maxAllowed, Math.max(INBOX_LEAD_LIST_WIDTH_MIN, nextWidth)));
    };

    const handleMouseUp = () => {
      setIsResizingLeadList(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingLeadList]);

  const handleLeadListResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isDesktopViewport) return;
    event.preventDefault();
    setIsResizingLeadList(true);
  };

  const sendMessage = async () => {
    if (!selectedConversationId || !messageBody.trim()) return;
    await inbox.appendMessageMutation.mutateAsync({
      action: 'append_message',
      conversation_id: selectedConversationId,
      body: messageBody,
      message_type: inbox.selectedConversation?.channel === 'manual_note' ? 'note' : 'text',
      whatsapp_instance_id: inbox.selectedInstance?.id || inbox.selectedInstanceId || undefined,
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

  const uploadViaStorageIntent = async (input: {
    file: File;
    kind: InternalCrmAttachmentKind;
    mediaVariant?: InternalCrmMediaVariant;
    isVoiceNote?: boolean;
    preferSticker?: boolean;
  }) => {
    if (!selectedConversationId) throw new Error('Conversa nao selecionada.');

    const { data, error } = await inbox.supabaseClient.functions.invoke('internal-crm-storage-intent', {
      body: {
        conversationId: selectedConversationId,
        fileName: input.file.name,
        sizeBytes: input.file.size,
        mimeType: input.file.type,
        kind: input.kind,
        mediaVariant: input.mediaVariant,
        isVoiceNote: input.isVoiceNote === true,
        preferSticker: input.preferSticker === true,
      },
    });

    if (error) {
      throw new Error(error.message || 'Falha ao preparar upload.');
    }

    const uploadUrl = String(data?.uploadUrl || '');
    const deliveryUrl = String(data?.deliveryUrl || data?.publicUrl || '');
    const sendMode = String(data?.sendMode || input.kind) as InternalCrmAttachmentKind;
    const mediaVariant = String(data?.mediaVariant || input.mediaVariant || 'standard') as InternalCrmMediaVariant;

    if (!uploadUrl || !deliveryUrl) {
      throw new Error('Storage intent retornou dados incompletos.');
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: input.file,
      headers: {
        'Content-Type': input.file.type || 'application/octet-stream',
      },
    });

    if (!uploadResponse.ok) {
      throw new Error(`Falha no upload do arquivo (${uploadResponse.status}).`);
    }

    return {
      deliveryUrl,
      sendMode,
      mediaVariant,
    };
  };

  const sendAttachment = async (
    file: File,
    fileType: InternalCrmAttachmentKind,
    options?: {
      caption?: string;
      mediaVariant?: 'standard' | 'gif' | 'sticker';
      preferSticker?: boolean;
    },
  ) => {
    if (!selectedConversationId) return;
    setIsSendingMedia(true);
    try {
      const prepared = await uploadViaStorageIntent({
        file,
        kind: fileType,
        mediaVariant: options?.mediaVariant || 'standard',
        preferSticker: options?.preferSticker,
      });

      await inbox.appendMessageMutation.mutateAsync({
        action: 'append_message',
        conversation_id: selectedConversationId,
        body: options?.caption || '',
        message_type: prepared.sendMode,
        attachment_url: prepared.deliveryUrl,
        attachment_ready: true,
        attachment_mimetype: file.type || null,
        attachment_name: file.name,
        attachment_size: file.size,
        metadata: {
          media_variant: prepared.mediaVariant,
        },
        whatsapp_instance_id: inbox.selectedInstance?.id || inbox.selectedInstanceId || undefined,
      });
    } finally {
      setIsSendingMedia(false);
    }
  };

  const sendAudio = async (
    audioBlob: Blob,
    durationSeconds: number,
    options?: {
      fileName?: string;
      mimeType?: string;
    },
  ) => {
    if (!selectedConversationId) return;
    const mimeType = options?.mimeType || audioBlob.type || 'audio/webm';
    const fileName = options?.fileName || `audio.${mimeType.includes('ogg') ? 'ogg' : 'webm'}`;
    const audioFile = new File([audioBlob], fileName, { type: mimeType });

    setIsSendingMedia(true);
    try {
      const prepared = await uploadViaStorageIntent({
        file: audioFile,
        kind: 'audio',
        mediaVariant: 'voice_note',
        isVoiceNote: true,
      });

      await inbox.appendMessageMutation.mutateAsync({
        action: 'append_message',
        conversation_id: selectedConversationId,
        body: '',
        message_type: prepared.sendMode,
        attachment_url: prepared.deliveryUrl,
        attachment_ready: true,
        attachment_mimetype: mimeType,
        attachment_name: fileName,
        attachment_size: audioFile.size,
        metadata: {
          media_variant: prepared.mediaVariant,
          duration_seconds: durationSeconds,
        },
        whatsapp_instance_id: inbox.selectedInstance?.id || inbox.selectedInstanceId || undefined,
      });
    } finally {
      setIsSendingMedia(false);
    }
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

  const sendBlockedReason = useMemo(() => {
    const selectedConversation = inbox.selectedConversation;
    if (!selectedConversation) return null;
    if (selectedConversation.channel === 'manual_note') return null;

    if (!inbox.selectedInstance?.id) {
      return 'Selecione uma instancia conectada para enviar mensagens.';
    }

    if (inbox.selectedInstance.status !== 'connected') {
      return 'A instancia selecionada esta pausada. Conecte-a ou selecione outra instancia.';
    }

    return null;
  }, [inbox.selectedConversation, inbox.selectedInstance]);

  const handleToggleInstanceAi = async (enabled: boolean) => {
    if (!inbox.selectedInstance?.id) return;
    await inbox.upsertInstanceMutation.mutateAsync({
      action: 'upsert_instance',
      instance_id: inbox.selectedInstance.id,
      ai_enabled: enabled,
    });
    toast({ title: enabled ? 'IA ativada' : 'IA pausada' });
  };

  const saveAppointment = async (payload: Record<string, unknown>) => {
    await appointmentMutation.mutateAsync({
      action: 'upsert_appointment',
      ...payload,
      client_id: selectedClientId || payload.client_id,
    });
    toast({ title: 'Reuniao agendada' });
    setAppointmentModalOpen(false);
  };

  const saveAppointmentWithDealLink = async (payload: Record<string, unknown>) => {
    const clientId = String(selectedClientId || payload.client_id || '');
    if (!clientId) return;

    const availableDeals = getOpenDealsForClient(inbox.clientDetailQuery.data?.deals || [], clientId);
    let resolvedDealId = String(payload.deal_id || '');

    if (!resolvedDealId) {
      if (availableDeals.length === 1) {
        resolvedDealId = availableDeals[0].id;
      } else if (availableDeals.length === 0) {
        const targetClient = clients.find((client) => client.id === clientId);
        const created = await upsertDealMutation.mutateAsync({
          action: 'upsert_deal',
          client_id: clientId,
          title: String(payload.new_deal_title || buildAutoDealTitle({
            companyName: targetClient?.company_name,
            contactName: targetClient?.primary_contact_name,
          })),
          owner_user_id: targetClient?.owner_user_id || null,
          stage_code: 'novo_lead',
          probability: 5,
          notes: null,
          items: [],
        }) as { deal?: { id?: string } };
        resolvedDealId = created.deal?.id || '';
      }
    }

    if (!resolvedDealId) {
      toast({
        title: 'Selecione um deal',
        description: 'Este cliente possui mais de um deal aberto. Escolha qual deve ser vinculado.',
        variant: 'destructive',
      });
      return;
    }

    await appointmentMutation.mutateAsync({
      action: 'upsert_appointment',
      ...payload,
      client_id: clientId,
      deal_id: resolvedDealId,
    });
    toast({ title: 'Reuniao agendada' });
    setAppointmentModalOpen(false);
  };

  const navigatePipeline = () => {
    const targetClientId = selectedClientId || inbox.selectedConversation?.client_id || '';
    navigate(targetClientId ? `/admin/crm/pipeline?client=${targetClientId}` : '/admin/crm/pipeline');
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden" data-testid="crm-inbox-root">
      <div
        ref={workspaceRef}
        className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-card"
        data-testid="crm-inbox-workspace"
      >
          {/* Conversation list */}
          <div
            className={cn('min-h-0 overflow-hidden', selectedConversationId ? 'hidden lg:block' : 'block')}
            style={isDesktopViewport ? { width: leadListWidth, minWidth: leadListWidth, maxWidth: leadListWidth } : undefined}
          >
            <InternalCrmConversationList
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              onSelectConversation={setSelectedConversationId}
              search={search}
              onSearchChange={setSearch}
              stageFilter={stageFilter}
              onStageFilterChange={setStageFilter}
              instanceFilter={instanceFilter}
              onInstanceFilterChange={setInstanceFilter}
              instances={inbox.instances}
              isLoading={inbox.conversationsQuery.isLoading}
            />
          </div>

          {isDesktopViewport ? (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar lista de leads"
              className={cn(
                'hidden w-1.5 cursor-col-resize border-l border-r border-border/30 bg-transparent transition-colors lg:block',
                isResizingLeadList ? 'bg-primary/30' : 'hover:bg-primary/20',
              )}
              onMouseDown={handleLeadListResizeStart}
            />
          ) : null}


          {/* Chat area */}
          <div
            className={cn(
              'min-h-0 min-w-0 flex-1 overflow-hidden border-l border-border/40',
              !selectedConversationId ? 'hidden lg:block' : 'block',
            )}
          >
            <InternalCrmChatAreaFull
              conversation={inbox.selectedConversation}
              messages={inbox.messages}
              instances={inbox.instances}
              selectedInstanceId={inbox.selectedInstanceId}
              onSelectInstance={inbox.setSelectedInstanceId}
              instance={inbox.selectedInstance}
              onToggleInstanceAi={handleToggleInstanceAi}
              isTogglingInstanceAi={inbox.upsertInstanceMutation.isPending}
              messageBody={messageBody}
              onMessageBodyChange={setMessageBody}
              onSendMessage={sendMessage}
              onSendAttachment={sendAttachment}
              onSendAudio={sendAudio}
              onRetryMessageMedia={async (messageId) => {
                try {
                  await inbox.retryMessageMediaMutation.mutateAsync({
                    action: 'retry_message_media',
                    message_id: messageId,
                  });
                } catch (error) {
                  toast({
                    title: 'Falha ao reprocessar midia',
                    description: error instanceof Error ? error.message : 'Nao foi possivel reenfileirar a midia.',
                    variant: 'destructive',
                  });
                }
              }}
              isSending={inbox.appendMessageMutation.isPending || isSendingMedia}
              sendBlockedReason={sendBlockedReason}
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

          {/* Actions panel (desktop) */}
          {isDetailsPanelOpen && (
            <div className="hidden min-h-0 w-[340px] border-l border-border/40 xl:block">
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

      {/* Mobile actions sheet */}
      <InternalCrmConversationActionsSheet
        open={actionsSheetOpen}
        onOpenChange={setActionsSheetOpen}
        conversation={inbox.selectedConversation}
        detail={inbox.clientDetailQuery.data || null}
        onScheduleMeeting={() => setAppointmentModalOpen(true)}
        onScheduleCall={() => setAppointmentModalOpen(true)}
        onOpenComments={() => setNotesSheetOpen(true)}
        onNavigatePipeline={navigatePipeline}
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
        deals={inbox.clientDetailQuery.data?.deals || []}
        defaultStartAt={new Date().toISOString()}
        isSubmitting={appointmentMutation.isPending}
        onSave={saveAppointmentWithDealLink}
      />
    </div>
  );
}
