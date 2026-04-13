import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { internalCrmQueryKeys } from '@/modules/internal-crm/hooks/useInternalCrmApi';

const INTERNAL_CRM_REALTIME_TABLES = [
  'deals',
  'deal_items',
  'clients',
  'client_contacts',
  'client_notes',
  'tasks',
  'appointments',
  'conversations',
  'messages',
  'pipeline_stages',
  'broadcast_campaigns',
  'broadcast_recipients',
  'automation_rules',
  'automation_runs',
  'whatsapp_instances',
  'customer_app_links',
] as const;

export function useInternalCrmRealtime(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase.channel('internal-crm-realtime-sync');

    const scheduleInvalidate = () => {
      if (invalidateTimer) {
        clearTimeout(invalidateTimer);
      }

      invalidateTimer = setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: internalCrmQueryKeys.all(),
          refetchType: 'active',
        });
      }, 150);
    };

    for (const table of INTERNAL_CRM_REALTIME_TABLES) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'internal_crm',
          table,
        },
        () => {
          scheduleInvalidate();
        },
      );
    }

    channel.subscribe();

    return () => {
      if (invalidateTimer) {
        clearTimeout(invalidateTimer);
      }
      void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}

