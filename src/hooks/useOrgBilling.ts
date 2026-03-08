import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type BillingAccessState = 'full' | 'read_only' | 'blocked';

export type OrgBillingInfo = {
  org_id: string;
  plan_key: string;
  subscription_status: string;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  current_period_end: string | null;
  onboarding_state: string | null;
  access_state: BillingAccessState;
  limits: Record<string, unknown>;
  usage: Record<string, unknown>;
  packs: Array<Record<string, unknown>>;
};

const BILLING_QUERY_KEY = ['org-billing-info'] as const;

export function useOrgBillingInfo(enabled = true) {
  const { orgId } = useAuth();

  return useQuery({
    queryKey: [...BILLING_QUERY_KEY, orgId],
    enabled: enabled && Boolean(orgId),
    staleTime: 30_000,
    queryFn: async (): Promise<OrgBillingInfo | null> => {
      if (!orgId) return null;

      const { data, error } = await supabase.rpc('get_org_billing_info', { p_org_id: orgId });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return row as OrgBillingInfo;
    },
  });
}

export async function createPlanCheckoutSession(planKey: string, orgId?: string | null) {
  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: {
      plan_key: planKey,
      ...(orgId ? { org_id: orgId } : {}),
    },
  });

  if (error) {
    throw new Error(error.message || 'Falha ao iniciar checkout');
  }

  const checkoutUrl = (data as { checkout_url?: string })?.checkout_url;
  if (!checkoutUrl) {
    throw new Error('Checkout indisponível no momento');
  }

  return checkoutUrl;
}

export async function createPackCheckoutSession(addonKey: string, quantity = 1, orgId?: string | null) {
  const { data, error } = await supabase.functions.invoke('stripe-pack-checkout', {
    body: {
      addon_key: addonKey,
      quantity,
      ...(orgId ? { org_id: orgId } : {}),
    },
  });

  if (error) {
    throw new Error(error.message || 'Falha ao iniciar checkout de pacote');
  }

  const checkoutUrl = (data as { checkout_url?: string })?.checkout_url;
  if (!checkoutUrl) {
    throw new Error('Checkout de pacote indisponível no momento');
  }

  return checkoutUrl;
}

export async function createBillingPortalSession(orgId?: string | null) {
  const { data, error } = await supabase.functions.invoke('stripe-portal', {
    body: {
      ...(orgId ? { org_id: orgId } : {}),
    },
  });

  if (error) {
    throw new Error(error.message || 'Falha ao abrir portal de cobrança');
  }

  const portalUrl = (data as { portal_url?: string })?.portal_url;
  if (!portalUrl) {
    throw new Error('Portal de cobrança indisponível no momento');
  }

  return portalUrl;
}
