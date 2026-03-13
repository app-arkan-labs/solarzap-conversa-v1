import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { resolveSupabaseFunctionErrorMessage } from '@/lib/supabaseFunctionErrors';

export type BillingAccessState = 'full' | 'read_only' | 'blocked';

export type OrgBillingInfo = {
  org_id: string;
  plan_key: string;
  plan_limits?: Record<string, unknown>;
  features?: Record<string, unknown>;
  subscription_status: string;
  trial_ends_at: string | null;
  trial_started_at?: string | null;
  grace_ends_at: string | null;
  current_period_end: string | null;
  onboarding_state: string | null;
  access_state: BillingAccessState;
  effective_limits?: Record<string, unknown>;
  limits: Record<string, unknown>;
  usage: Record<string, unknown>;
  packs: Array<Record<string, unknown>>;
};

const BILLING_QUERY_KEY = ['org-billing-info'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const asArrayOfRecords = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => isRecord(item)) : [];

const asBillingAccessState = (value: unknown): BillingAccessState => {
  if (value === 'read_only' || value === 'blocked' || value === 'full') {
    return value;
  }
  return 'blocked';
};

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
      const payload = isRecord(row) ? row : {};
      const planKeyCandidate = payload.plan_key ?? payload.plan;
      const planKey = typeof planKeyCandidate === 'string' && planKeyCandidate.trim().length > 0
        ? planKeyCandidate.trim()
        : 'free';
      const planLimits = asRecord(payload.plan_limits ?? payload.limits);
      const features = asRecord(payload.features);
      const usage = asRecord(payload.usage);
      const effectiveLimits = asRecord(payload.effective_limits ?? payload.plan_limits ?? payload.limits);

      return {
        org_id: orgId,
        plan_key: planKey,
        plan_limits: planLimits,
        features,
        subscription_status: typeof payload.subscription_status === 'string' ? payload.subscription_status : 'none',
        trial_ends_at: asNullableString(payload.trial_ends_at),
        trial_started_at: asNullableString(payload.trial_started_at),
        grace_ends_at: asNullableString(payload.grace_ends_at),
        current_period_end: asNullableString(payload.current_period_end),
        onboarding_state: asNullableString(payload.onboarding_state),
        access_state: asBillingAccessState(payload.access_state),
        effective_limits: effectiveLimits,
        limits: planLimits,
        usage,
        packs: asArrayOfRecords(payload.packs ?? payload.active_addons),
      };
    },
  });
}

export async function createPlanCheckoutSession(input: {
  planKey: string;
  orgId?: string | null;
  orgName?: string;
  successUrl?: string;
  cancelUrl?: string;
}) {
  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: {
      plan_key: input.planKey,
      ...(input.orgId ? { org_id: input.orgId } : {}),
      ...(input.orgName ? { org_name: input.orgName } : {}),
      ...(input.successUrl ? { success_url: input.successUrl } : {}),
      ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
    },
  });

  if (error) {
    const message = await resolveSupabaseFunctionErrorMessage(error, 'Falha ao iniciar checkout');
    throw new Error(message);
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
    const message = await resolveSupabaseFunctionErrorMessage(error, 'Falha ao iniciar checkout de pacote');
    throw new Error(message);
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
    const message = await resolveSupabaseFunctionErrorMessage(error, 'Falha ao abrir portal de cobranca');
    throw new Error(message);
  }

  const portalUrl = (data as { portal_url?: string })?.portal_url;
  if (!portalUrl) {
    throw new Error('Portal de cobrança indisponível no momento');
  }

  return portalUrl;
}
