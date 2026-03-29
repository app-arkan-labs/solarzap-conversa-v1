import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  internalCrmQueryKeys,
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
    return conversationsQuery.data?.conversations.find((conversation) => conversation.id === selectedConversationId) || null;
  }, [conversationsQuery.data?.conversations, selectedConversationId]);

  const selectedInstance = useMemo(() => {
    return instancesQuery.data?.instances.find((instance) => instance.id === conversationDetailQuery.data?.whatsapp_instance?.id) || null;
  }, [conversationDetailQuery.data?.whatsapp_instance?.id, instancesQuery.data?.instances]);

  const appendMessageMutation = useInternalCrmMutation({
    invalidate: selectedConversationId
      ? [
          internalCrmQueryKeys.conversations({ status: normalizedStatus }),
          internalCrmQueryKeys.conversationDetail(selectedConversationId),
        ]
      : [internalCrmQueryKeys.conversations({ status: normalizedStatus })],
  });

  const upsertInstanceMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.instances()],
  });

  const connectInstanceMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.instances()],
  });

  useEffect(() => {
    const channel = supabase
      .channel('internal_crm_messages_stream')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'internal_crm',
          table: 'messages',
        },
        (payload) => {
          void queryClient.invalidateQueries({ queryKey: ['internal-crm', 'conversations'] });
          const conversationId = String((payload.new as { conversation_id?: string })?.conversation_id || '');
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

  return {
    conversationsQuery,
    conversationDetailQuery,
    instancesQuery,
    selectedConversation,
    selectedInstance,
    appendMessageMutation,
    upsertInstanceMutation,
    connectInstanceMutation,
  };
}
