import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type BillingCheckResult = {
  allowed: boolean;
  current: number;
  projected: number;
  limit: number | null;
  reason: string | null;
  access_state: string;
};

export function getSupabaseEnv() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error('missing_supabase_env');
  }

  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
}

export async function getAuthenticatedUser(req: Request) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    throw new Error('missing_auth');
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) {
    throw new Error('unauthorized');
  }

  return data.user;
}

export function getServiceClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseEnv();
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

export async function resolveOrgMembership(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  requestedOrgId?: string | null,
) {
  let query = serviceClient
    .from('organization_members')
    .select('org_id, role, created_at')
    .eq('user_id', userId);

  if (requestedOrgId) {
    query = query.eq('org_id', requestedOrgId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: true })
    .order('org_id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.org_id) {
    throw new Error('membership_not_found');
  }

  return {
    orgId: String(data.org_id),
    role: String(data.role || 'user'),
  };
}

export async function checkLimit(
  serviceClient: ReturnType<typeof createClient>,
  orgId: string,
  limitKey: string,
  quantity = 1,
): Promise<BillingCheckResult> {
  const { data, error } = await serviceClient.rpc('check_plan_limit', {
    p_org_id: orgId,
    p_limit_key: limitKey,
    p_quantity: quantity,
  });

  if (error) {
    throw new Error(`check_plan_limit_failed:${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row?.allowed),
    current: Number(row?.current || 0),
    projected: Number(row?.projected || 0),
    limit: row?.limit == null ? null : Number(row.limit),
    reason: row?.reason == null ? null : String(row.reason),
    access_state: String(row?.access_state || 'full'),
  };
}

export async function recordUsage(
  serviceClient: ReturnType<typeof createClient>,
  params: {
    orgId: string;
    userId?: string | null;
    leadId?: number | null;
    eventType: string;
    quantity?: number;
    metadata?: Record<string, unknown>;
    source?: string;
  },
) {
  const mergedMetadata = {
    ...(params.metadata ?? {}),
    ...(params.userId ? { user_id: params.userId } : {}),
    ...(params.leadId != null ? { lead_id: params.leadId } : {}),
    ...(params.source ? { source: params.source } : {}),
  };

  const { error } = await serviceClient.rpc('record_usage', {
    p_org_id: params.orgId,
    p_event_type: params.eventType,
    p_quantity: params.quantity ?? 1,
    p_metadata: mergedMetadata,
  });

  if (error) {
    throw new Error(`record_usage_failed:${error.message}`);
  }
}

export async function appendBillingTimeline(
  serviceClient: ReturnType<typeof createClient>,
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
  actor = 'system',
) {
  const { error } = await serviceClient.from('org_billing_timeline').insert({
    org_id: orgId,
    event_type: eventType,
    actor,
    payload,
  });

  if (error) {
    console.warn('appendBillingTimeline failed', { orgId, eventType, error: error.message });
  }
}
