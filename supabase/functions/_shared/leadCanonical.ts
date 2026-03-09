export type UpsertLeadCanonicalPayloadInput = {
  userId: string;
  orgId?: string | null;
  instanceName: string;
  phoneE164: string;
  telefone: string;
  name?: string | null;
  pushName?: string | null;
  source?: string | null;
};

export type LeadResolutionMethod =
  | 'rpc_org'
  | 'rpc_legacy'
  | 'lookup_existing'
  | 'direct_insert'
  | 'failed';

export type ResolveLeadCanonicalInput = {
  supabase: any;
  userId: string;
  orgId: string;
  instanceName: string;
  phoneE164: string;
  telefone: string;
  name?: string | null;
  pushName?: string | null;
  source?: string | null;
  channel?: string | null;
};

export type ResolveLeadCanonicalResult = {
  leadId: number | null;
  method: LeadResolutionMethod;
  error: string | null;
};

export function buildUpsertLeadCanonicalPayload(input: UpsertLeadCanonicalPayloadInput) {
  return {
    p_user_id: input.userId,
    p_org_id: input.orgId ?? null,
    p_instance_name: input.instanceName,
    p_phone_e164: input.phoneE164,
    p_telefone: input.telefone,
    p_name: input.name ?? null,
    p_push_name: input.pushName ?? null,
    p_source: input.source ?? 'whatsapp',
  };
}

export function buildLegacyUpsertLeadCanonicalPayload(input: UpsertLeadCanonicalPayloadInput) {
  return {
    p_user_id: input.userId,
    p_instance_name: input.instanceName,
    p_phone_e164: input.phoneE164,
    p_telefone: input.telefone,
    p_name: input.name ?? null,
    p_push_name: input.pushName ?? null,
    p_source: input.source ?? 'whatsapp',
  };
}

const toErrorCode = (error: unknown): string => {
  if (!error || typeof error !== 'object') return '';
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string' ? code : '';
};

const toErrorMessage = (error: unknown): string => {
  if (!error || typeof error !== 'object') return '';
  const message = (error as Record<string, unknown>).message;
  return typeof message === 'string' ? message : '';
};

const toLeadId = (row: unknown): number | null => {
  if (!row || typeof row !== 'object') return null;
  const raw = (row as Record<string, unknown>).id;
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function isUpsertLeadCanonicalSchemaDriftError(error: unknown): boolean {
  const code = toErrorCode(error);
  const message = toErrorMessage(error).toLowerCase();
  if (code === 'PGRST202' || code === 'PGRST204' || code === '42703') return true;
  return (
    message.includes('schema cache') ||
    message.includes('could not find the function public.upsert_lead_canonical')
  );
}

const isMissingColumnError = (error: unknown): boolean => {
  const code = toErrorCode(error);
  const message = toErrorMessage(error).toLowerCase();
  return code === '42703' || code === 'PGRST204' || message.includes('schema cache');
};

const ensureLeadBelongsToOrg = async (
  supabase: any,
  input: ResolveLeadCanonicalInput,
  leadId: number,
): Promise<boolean> => {
  const { data: leadRow, error: leadLookupError } = await supabase
    .from('leads')
    .select('id, org_id')
    .eq('id', leadId)
    .maybeSingle();

  if (leadLookupError || !leadRow?.id) return false;

  if (leadRow.org_id === input.orgId) return true;

  if (leadRow.org_id === null) {
    const { error: adoptError } = await supabase
      .from('leads')
      .update({
        org_id: input.orgId,
        assigned_to_user_id: input.userId,
      })
      .eq('id', leadId)
      .is('org_id', null);
    return !adoptError;
  }

  return false;
};

const findLeadByPhoneInOrg = async (
  supabase: any,
  orgId: string,
  phoneE164: string,
  telefone: string,
): Promise<number | null> => {
  const byE164 = await supabase
    .from('leads')
    .select('id')
    .eq('org_id', orgId)
    .eq('phone_e164', phoneE164)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!byE164.error && byE164.data?.id) {
    return Number(byE164.data.id);
  }

  if (!telefone) return null;

  const byTelefone = await supabase
    .from('leads')
    .select('id')
    .eq('org_id', orgId)
    .eq('telefone', telefone)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!byTelefone.error && byTelefone.data?.id) {
    return Number(byTelefone.data.id);
  }

  return null;
};

const directInsertLead = async (input: ResolveLeadCanonicalInput): Promise<{ leadId: number | null; error: string | null }> => {
  const nowIso = new Date().toISOString();
  const baseName = input.name || input.pushName || input.telefone || input.phoneE164;
  const primaryPayload: Record<string, unknown> = {
    org_id: input.orgId,
    user_id: input.userId,
    assigned_to_user_id: input.userId,
    instance_name: input.instanceName,
    phone_e164: input.phoneE164,
    telefone: input.telefone,
    nome: baseName,
    source: input.source ?? 'whatsapp',
    canal: input.channel ?? 'whatsapp',
    status_pipeline: 'novo_lead',
    consumo_kwh: 0,
    valor_estimado: 0,
    observacoes: '',
    created_at: nowIso,
    updated_at: nowIso,
  };

  let insertResult = await input.supabase.from('leads').insert(primaryPayload).select('id').single();
  if (insertResult.error && isMissingColumnError(insertResult.error)) {
    const fallbackPayload = {
      org_id: input.orgId,
      user_id: input.userId,
      assigned_to_user_id: input.userId,
      nome: baseName,
      telefone: input.telefone,
      canal: input.channel ?? 'whatsapp',
      status_pipeline: 'novo_lead',
      consumo_kwh: 0,
      valor_estimado: 0,
      observacoes: '',
      created_at: nowIso,
      updated_at: nowIso,
    };
    insertResult = await input.supabase.from('leads').insert(fallbackPayload).select('id').single();
  }

  if (insertResult.error || !insertResult.data?.id) {
    return {
      leadId: null,
      error: toErrorMessage(insertResult.error) || 'direct_insert_failed',
    };
  }

  return {
    leadId: Number(insertResult.data.id),
    error: null,
  };
};

export async function resolveLeadCanonicalId(input: ResolveLeadCanonicalInput): Promise<ResolveLeadCanonicalResult> {
  let lastError: string | null = null;

  const orgRpcResult = await input.supabase
    .rpc('upsert_lead_canonical', buildUpsertLeadCanonicalPayload(input))
    .single();

  if (!orgRpcResult.error) {
    const leadId = toLeadId(orgRpcResult.data);
    if (leadId && await ensureLeadBelongsToOrg(input.supabase, input, leadId)) {
      return { leadId, method: 'rpc_org', error: null };
    }
    lastError = leadId ? 'rpc_org_cross_org_lead' : 'rpc_org_missing_id';
  } else {
    lastError = toErrorMessage(orgRpcResult.error) || 'rpc_org_failed';
  }

  if (isUpsertLeadCanonicalSchemaDriftError(orgRpcResult.error)) {
    const legacyRpcResult = await input.supabase
      .rpc('upsert_lead_canonical', buildLegacyUpsertLeadCanonicalPayload(input))
      .single();
    if (!legacyRpcResult.error) {
      const leadId = toLeadId(legacyRpcResult.data);
      if (leadId && await ensureLeadBelongsToOrg(input.supabase, input, leadId)) {
        return { leadId, method: 'rpc_legacy', error: null };
      }
      lastError = leadId ? 'rpc_legacy_cross_org_lead' : 'rpc_legacy_missing_id';
    } else {
      lastError = toErrorMessage(legacyRpcResult.error) || 'rpc_legacy_failed';
    }
  }

  const existingLeadId = await findLeadByPhoneInOrg(input.supabase, input.orgId, input.phoneE164, input.telefone);
  if (existingLeadId) {
    return { leadId: existingLeadId, method: 'lookup_existing', error: null };
  }

  const insertedLead = await directInsertLead(input);
  if (insertedLead.leadId) {
    return { leadId: insertedLead.leadId, method: 'direct_insert', error: null };
  }

  return {
    leadId: null,
    method: 'failed',
    error: insertedLead.error || lastError || 'lead_resolution_failed',
  };
}
