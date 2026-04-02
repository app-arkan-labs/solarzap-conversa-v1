import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  internalCrmQueryKeys,
  useInternalCrmClientDetail,
  useInternalCrmConversationDetail,
  useInternalCrmConversations,
  useInternalCrmInstances,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';

export type InternalCrmInboxFilters = {
  status?: 'open' | 'resolved' | 'archived' | 'all';
};

export function useInternalCrmInbox(selectedConversationId: string | null, filters: InternalCrmInboxFilters) {
  const queryClient = useQueryClient();
  const normalizedStatus = filters.status && filters.status !== 'all' ? filters.status : undefined;

  const conversationsQuery = useInternalCrmConversations({ status: normalizedStatus });
  const conversationDetailQuery = useInternalCrmConversationDetail(selectedConversationId);
  const instancesQuery = useInternalCrmInstances();

  const selectedConversation = useMemo(() => {
    if (conversationDetailQuery.data?.conversation?.id === selectedConversationId) {
      return conversationDetailQuery.data.conversation;
    }

    return conversationsQuery.data?.conversations.find((conversation) => conversation.id === selectedConversationId) || null;
  }, [conversationDetailQuery.data?.conversation, conversationsQuery.data?.conversations, selectedConversationId]);

  const selectedClientId = selectedConversation?.client_id || conversationDetailQuery.data?.client?.id || null;
  const clientDetailQuery = useInternalCrmClientDetail(selectedClientId);

  const selectedInstance = useMemo(() => {
    const preferredInstanceId =
      conversationDetailQuery.data?.whatsapp_instance?.id ||
      conversationDetailQuery.data?.conversation?.whatsapp_instance_id ||
      selectedConversation?.whatsapp_instance_id;

    if (!preferredInstanceId) {
      return conversationDetailQuery.data?.whatsapp_instance || null;
    }

    return (
      instancesQuery.data?.instances.find((instance) => instance.id === preferredInstanceId) ||
      conversationDetailQuery.data?.whatsapp_instance ||
      null
    );
  }, [
    conversationDetailQuery.data?.conversation?.whatsapp_instance_id,
    conversationDetailQuery.data?.whatsapp_instance,
    instancesQuery.data?.instances,
    selectedConversation?.whatsapp_instance_id,
  ]);

  const invalidateConversationKeys = useMemo(() => {
    const keys: Array<readonly unknown[]> = [['internal-crm', 'conversations']];

    if (selectedConversationId) {
      keys.push(internalCrmQueryKeys.conversationDetail(selectedConversationId));
    }

    if (selectedClientId) {
      keys.push(internalCrmQueryKeys.clientDetail(selectedClientId));
    }

    return keys;
  }, [selectedClientId, selectedConversationId]);

  const appendMessageMutation = useInternalCrmMutation({
    invalidate: invalidateConversationKeys,
  });

  const markConversationReadMutation = useInternalCrmMutation({
    invalidate: invalidateConversationKeys,
  });

  const updateConversationStatusMutation = useInternalCrmMutation({
    invalidate: invalidateConversationKeys,
  });

  const upsertInstanceMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.instances()],
  });

  const connectInstanceMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.instances()],
  });

  const upsertClientMutation = useInternalCrmMutation({
    invalidate: invalidateConversationKeys,
  });

  const retryMessageMediaMutation = useInternalCrmMutation({
    invalidate: invalidateConversationKeys,
  });
  const retryMessageMedia = retryMessageMediaMutation.mutateAsync;

  const retryAttemptsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    retryAttemptsRef.current.clear();
  }, [selectedConversationId]);

  useEffect(() => {
    const channel = supabase
      .channel('internal_crm_messages_stream')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'internal_crm',
          table: 'messages',
        },
        (payload) => {
          void queryClient.invalidateQueries({ queryKey: ['internal-crm', 'conversations'] });
          const nextRow = (payload.new || payload.old) as { conversation_id?: string } | null;
          const conversationId = String(nextRow?.conversation_id || '');
          if (conversationId) {
            void queryClient.invalidateQueries({ queryKey: ['internal-crm', 'conversation-detail', conversationId] });
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'internal_crm',
          table: 'conversations',
        },
        (payload) => {
          const nextRow = (payload.new || payload.old) as { id?: string } | null;
          const conversationId = String(nextRow?.id || '');
          void queryClient.invalidateQueries({ queryKey: ['internal-crm', 'conversations'] });
          if (conversationId) {
            void queryClient.invalidateQueries({ queryKey: ['internal-crm', 'conversation-detail', conversationId] });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  useEffect(() => {
    const messages = conversationDetailQuery.data?.messages || [];
    const pendingMessages = messages.filter((message) => {
      if (!['image', 'video', 'audio', 'document'].includes(message.message_type)) return false;
      if (message.attachment_ready !== false) return false;

      const createdAtMs = new Date(message.created_at).getTime();
      const ageMs = Number.isFinite(createdAtMs) ? Date.now() - createdAtMs : Number.POSITIVE_INFINITY;
      return message.attachment_error === true || ageMs >= 5_000;
    });

    const pendingIds = new Set(pendingMessages.map((message) => message.id));
    for (const messageId of Array.from(retryAttemptsRef.current.keys())) {
      if (!pendingIds.has(messageId)) {
        retryAttemptsRef.current.delete(messageId);
      }
    }

    const retryableMessages = pendingMessages.filter((message) => {
      const attempts = retryAttemptsRef.current.get(message.id) || 0;
      return attempts < 3;
    });

    if (retryableMessages.length === 0) return undefined;

    const timeout = window.setTimeout(() => {
      void (async () => {
        for (const message of retryableMessages) {
          const attempts = retryAttemptsRef.current.get(message.id) || 0;
          retryAttemptsRef.current.set(message.id, attempts + 1);
          try {
            await retryMessageMedia({
              action: 'retry_message_media',
              message_id: message.id,
            });
          } catch {
            // leave state as-is; the retry counter prevents endless hammering
          }
        }
      })();
    }, 2_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [conversationDetailQuery.data?.messages, retryMessageMedia]);

  return {
    supabaseClient: supabase,
    conversationsQuery,
    conversationDetailQuery,
    instancesQuery,
    clientDetailQuery,
    selectedConversation,
    selectedClientId,
    selectedInstance,
    messages: conversationDetailQuery.data?.messages || [],
    appendMessageMutation,
    markConversationReadMutation,
    updateConversationStatusMutation,
    upsertClientMutation,
    upsertInstanceMutation,
    connectInstanceMutation,
    retryMessageMediaMutation,
  };
}
