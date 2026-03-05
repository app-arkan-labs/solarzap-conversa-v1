import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export function useOrgFeatureFlags() {
  const { orgId } = useAuth();

  return useQuery({
    queryKey: ['org-feature-flags', orgId ?? null],
    queryFn: async () => {
      if (!orgId) return {} as Record<string, boolean>;

      try {
        const { data, error } = await supabase.rpc('get_org_feature_flags', { p_org_id: orgId });
        if (error) {
          console.warn('[useOrgFeatureFlags] RPC failed, returning fallback', error);
          return {} as Record<string, boolean>;
        }

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return {} as Record<string, boolean>;
        }

        const entries = Object.entries(data as Record<string, unknown>).map(([key, value]) => [
          key,
          value === true,
        ]);
        return Object.fromEntries(entries) as Record<string, boolean>;
      } catch (error) {
        console.warn('[useOrgFeatureFlags] Unexpected error, returning fallback', error);
        return {} as Record<string, boolean>;
      }
    },
    enabled: Boolean(orgId),
    staleTime: 60_000,
    placeholderData: {},
  });
}
