import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type ProposalSegment = 'residencial' | 'empresarial' | 'agro' | 'usina' | 'unknown';

export interface ProposalMetrics {
  generated: number;
  shared: number;
  opened: number;
  downloadedClient: number;
  downloadedSeller: number;
  bySegment: Record<string, number>;
}

async function countDeliveryEvents(params: {
  userId: string;
  startIso: string;
  endIso: string;
  eventType: string;
  metadataKind?: string;
}): Promise<number> {
  let q = supabase
    .from('proposal_delivery_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', params.userId)
    .eq('event_type', params.eventType)
    .gte('created_at', params.startIso)
    .lte('created_at', params.endIso);

  if (params.metadataKind) {
    q = q.contains('metadata', { kind: params.metadataKind });
  }

  const { count, error } = await q;
  if (error) throw error;
  return Number(count || 0);
}

export function useProposalMetrics(params: { start: Date; end: Date }) {
  return useQuery({
    queryKey: ['proposal-metrics', params.start.toISOString(), params.end.toISOString()],
    queryFn: async (): Promise<ProposalMetrics> => {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId) throw new Error('User not authenticated');

      const startIso = params.start.toISOString();
      const endIso = params.end.toISOString();

      const [generated, shared, opened, downloadedClient, downloadedSeller] = await Promise.all([
        countDeliveryEvents({ userId, startIso, endIso, eventType: 'generated' }),
        countDeliveryEvents({ userId, startIso, endIso, eventType: 'shared' }),
        countDeliveryEvents({ userId, startIso, endIso, eventType: 'opened' }),
        countDeliveryEvents({ userId, startIso, endIso, eventType: 'downloaded', metadataKind: 'client_proposal' }),
        countDeliveryEvents({ userId, startIso, endIso, eventType: 'downloaded', metadataKind: 'seller_script' }),
      ]);

      // Segment distribution is best-effort; used only to show what's being generated more no período.
      const { data: versions, error: verErr } = await supabase
        .from('proposal_versions')
        .select('segment')
        .eq('user_id', userId)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .limit(5000);
      if (verErr) throw verErr;

      const bySegment: Record<string, number> = {};
      for (const row of versions || []) {
        const key = String((row as any)?.segment || 'unknown');
        bySegment[key] = (bySegment[key] || 0) + 1;
      }

      return {
        generated,
        shared,
        opened,
        downloadedClient,
        downloadedSeller,
        bySegment,
      };
    },
    staleTime: 15_000,
  });
}

