import { resolveLeadCanonicalId } from './leadCanonical.ts';
import { applyLeadAttribution, type AttributionInput } from './trackingAttribution.ts';

type AnyRecord = Record<string, unknown>;

type InternalCrmTrackingBridgeRow = {
  internal_client_id: string;
  internal_deal_id: string | null;
  org_id: string;
  public_lead_id: number;
  owner_user_id: string | null;
  last_synced_stage_code: string | null;
  attribution_snapshot: AnyRecord;
};

type SyncBridgeInput = {
  supabase: any;
  internalClientId: string;
  internalDealId?: string | null;
  stageCode?: string | null;
  linkedPublicOrgId?: string | null;
  linkedPublicUserId?: string | null;
  ownerUserId?: string | null;
  attributionSnapshot?: Record<string, unknown> | null;
  syncedAt?: string | null;
};

type SyncBridgeResult = {
  ok: boolean;
  bridge: InternalCrmTrackingBridgeRow | null;
  publicLeadId: number | null;
  skippedReason?: string | null;
};

const TRACKING_ATTR_KEYS: Array<keyof AttributionInput> = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'raw_querystring',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'fbc',
  'fbp',
  'ttclid',
  'msclkid',
  'session_id',
  'landing_page_url',
  'referrer_url',
  'user_email',
  'user_phone',
  'user_ip',
  'user_agent',
  'messageText',
];

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizePhone(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

function mergeRecord(base: unknown, patch: unknown): AnyRecord {
  const left = isRecord(base) ? base : {};
  const right = isRecord(patch) ? patch : {};
  return { ...left, ...right };
}

function rolePriority(role: string | null | undefined): number {
  if (role === 'owner') return 1;
  if (role === 'admin') return 2;
  if (role === 'user') return 3;
  if (role === 'consultant') return 4;
  return 10;
}

export async function resolveOrgPrimaryUserId(supabase: any, orgId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('user_id, role, created_at')
    .eq('org_id', orgId)
    .limit(100);

  if (error || !Array.isArray(data) || data.length < 1) return null;

  const sorted = [...data].sort((left, right) => {
    const priorityDiff = rolePriority(asString(left.role)) - rolePriority(asString(right.role));
    if (priorityDiff !== 0) return priorityDiff;

    const leftTime = new Date(String(left.created_at || '')).getTime();
    const rightTime = new Date(String(right.created_at || '')).getTime();
    return leftTime - rightTime;
  });

  return asString(sorted[0]?.user_id);
}

function deriveFbc(snapshot: AnyRecord): string | null {
  const existing = asString(snapshot.fbc);
  if (existing) return existing;

  const fbclid = asString(snapshot.fbclid);
  if (!fbclid) return null;

  return `fb.1.${Date.now()}.${fbclid}`;
}

function buildAttributionSnapshot(raw: Record<string, unknown> | null | undefined): AnyRecord {
  const input = isRecord(raw) ? raw : {};
  const snapshot: AnyRecord = {};

  for (const key of TRACKING_ATTR_KEYS) {
    const value = input[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      snapshot[key] = value.trim();
    }
  }

  if (isRecord(input.ctwa)) {
    snapshot.ctwa = { ...input.ctwa };
  }

  const extras = ['pageview_id', 'button_id', 'button_label', 'section_id', 'locale', 'timezone'];
  for (const key of extras) {
    const value = asString(input[key]);
    if (value) snapshot[key] = value;
  }

  const derivedFbc = deriveFbc(snapshot);
  if (derivedFbc) snapshot.fbc = derivedFbc;

  return snapshot;
}

function buildAttributionApplyInput(
  orgId: string,
  leadId: number,
  client: AnyRecord,
  snapshot: AnyRecord,
): AttributionInput {
  return {
    orgId,
    leadId,
    utm_source: asString(snapshot.utm_source),
    utm_medium: asString(snapshot.utm_medium),
    utm_campaign: asString(snapshot.utm_campaign),
    utm_content: asString(snapshot.utm_content),
    utm_term: asString(snapshot.utm_term),
    raw_querystring: asString(snapshot.raw_querystring),
    gclid: asString(snapshot.gclid),
    gbraid: asString(snapshot.gbraid),
    wbraid: asString(snapshot.wbraid),
    fbclid: asString(snapshot.fbclid),
    fbc: asString(snapshot.fbc),
    fbp: asString(snapshot.fbp),
    ttclid: asString(snapshot.ttclid),
    msclkid: asString(snapshot.msclkid),
    session_id: asString(snapshot.session_id),
    landing_page_url: asString(snapshot.landing_page_url),
    referrer_url: asString(snapshot.referrer_url),
    user_email: asString(snapshot.user_email) || asString(client.primary_email),
    user_phone: asString(snapshot.user_phone) || normalizePhone(client.primary_phone),
    user_ip: asString(snapshot.user_ip),
    user_agent: asString(snapshot.user_agent),
    messageText: asString(snapshot.messageText),
    ctwa: isRecord(snapshot.ctwa)
      ? {
          ctwa_source_url: asString(snapshot.ctwa.ctwa_source_url),
          ctwa_source_type: asString(snapshot.ctwa.ctwa_source_type),
          ctwa_source_id: asString(snapshot.ctwa.ctwa_source_id),
          ctwa_headline: asString(snapshot.ctwa.ctwa_headline),
          ctwa_body: asString(snapshot.ctwa.ctwa_body),
          ctwa_clid: asString(snapshot.ctwa.ctwa_clid),
        }
      : null,
  };
}

async function updatePublicLeadRecord(input: {
  supabase: any;
  orgId: string;
  leadId: number;
  name: string | null;
  email: string | null;
  stageCode: string | null;
  ownerUserId: string | null;
}) {
  const basePayload: Record<string, unknown> = {
    updated_at: nowIso(),
  };
  if (input.name) basePayload.nome = input.name;
  if (input.stageCode) basePayload.status_pipeline = input.stageCode;
  if (input.ownerUserId) basePayload.assigned_to_user_id = input.ownerUserId;
  if (input.email) basePayload.email = input.email;

  let updateResult = await input.supabase
    .from('leads')
    .update(basePayload)
    .eq('id', input.leadId)
    .eq('org_id', input.orgId);

  const errorCode = String(updateResult.error?.code || '');
  if (updateResult.error && (errorCode === '42703' || errorCode === 'PGRST204') && Object.prototype.hasOwnProperty.call(basePayload, 'email')) {
    delete basePayload.email;
    updateResult = await input.supabase
      .from('leads')
      .update(basePayload)
      .eq('id', input.leadId)
      .eq('org_id', input.orgId);
  }

  if (updateResult.error) {
    throw updateResult.error;
  }
}

export async function syncInternalCrmTrackingBridge(input: SyncBridgeInput): Promise<SyncBridgeResult> {
  const crm = input.supabase.schema('internal_crm');
  const syncedAt = asString(input.syncedAt) || nowIso();

  const [{ data: client, error: clientError }, { data: existingBridge, error: bridgeError }] = await Promise.all([
    crm
      .from('clients')
      .select('id, company_name, primary_contact_name, primary_phone, primary_email, source_channel, linked_public_org_id, linked_public_user_id')
      .eq('id', input.internalClientId)
      .maybeSingle(),
    crm
      .from('tracking_bridge')
      .select('*')
      .eq('internal_client_id', input.internalClientId)
      .maybeSingle(),
  ]);

  if (clientError) throw clientError;
  if (bridgeError) throw bridgeError;
  if (!client?.id) {
    return { ok: true, bridge: null, publicLeadId: null, skippedReason: 'client_not_found' };
  }

  let deal: AnyRecord | null = null;
  const effectiveDealId = asString(input.internalDealId) || asString(existingBridge?.internal_deal_id);
  if (effectiveDealId) {
    const { data: dealData, error: dealError } = await crm
      .from('deals')
      .select('id, owner_user_id, stage_code, commercial_context')
      .eq('id', effectiveDealId)
      .maybeSingle();
    if (dealError) throw dealError;
    deal = isRecord(dealData) ? dealData : null;
  }

  const orgId =
    asString(input.linkedPublicOrgId) ||
    asString(client.linked_public_org_id) ||
    asString(existingBridge?.org_id);
  if (!orgId) {
    return { ok: true, bridge: null, publicLeadId: null, skippedReason: 'missing_linked_org' };
  }

  let publicUserId =
    asString(input.linkedPublicUserId) ||
    asString(client.linked_public_user_id) ||
    asString(input.ownerUserId) ||
    asString(deal?.owner_user_id) ||
    asString(existingBridge?.owner_user_id);
  if (!publicUserId) {
    publicUserId = await resolveOrgPrimaryUserId(input.supabase, orgId);
  }
  if (!publicUserId) {
    return { ok: true, bridge: null, publicLeadId: null, skippedReason: 'missing_public_user' };
  }

  const phone = normalizePhone(client.primary_phone);
  if (!phone) {
    return { ok: true, bridge: null, publicLeadId: null, skippedReason: 'missing_phone' };
  }

  const leadResolution = await resolveLeadCanonicalId({
    supabase: input.supabase,
    userId: publicUserId,
    orgId,
    instanceName: 'internal-crm-bridge',
    phoneE164: phone,
    telefone: phone,
    name: asString(client.primary_contact_name) || asString(client.company_name),
    pushName: asString(client.primary_contact_name) || asString(client.company_name),
    source: asString(client.source_channel) || 'landing_page',
    channel: 'other',
  });

  if (!leadResolution.leadId) {
    return { ok: true, bridge: null, publicLeadId: null, skippedReason: leadResolution.error || 'lead_resolution_failed' };
  }

  const stageCode =
    asString(input.stageCode) ||
    asString(deal?.stage_code) ||
    asString(existingBridge?.last_synced_stage_code) ||
    'novo_lead';

  await updatePublicLeadRecord({
    supabase: input.supabase,
    orgId,
    leadId: leadResolution.leadId,
    name: asString(client.primary_contact_name) || asString(client.company_name),
    email: asString(client.primary_email),
    stageCode,
    ownerUserId: publicUserId,
  });

  const mergedSnapshot = mergeRecord(existingBridge?.attribution_snapshot, input.attributionSnapshot);
  if (Object.keys(mergedSnapshot).length > 0) {
    await applyLeadAttribution(
      input.supabase,
      buildAttributionApplyInput(orgId, leadResolution.leadId, client, mergedSnapshot),
    );
  }

  const bridgePayload = {
    internal_client_id: input.internalClientId,
    internal_deal_id: effectiveDealId,
    org_id: orgId,
    public_lead_id: leadResolution.leadId,
    owner_user_id: publicUserId,
    last_synced_stage_code: stageCode,
    attribution_snapshot: mergedSnapshot,
    first_synced_at: asString(existingBridge?.first_synced_at) || syncedAt,
    last_synced_at: syncedAt,
    updated_at: syncedAt,
  };

  const { data: bridge, error: bridgeUpsertError } = await crm
    .from('tracking_bridge')
    .upsert(bridgePayload, { onConflict: 'internal_client_id' })
    .select('*')
    .single();

  if (bridgeUpsertError) throw bridgeUpsertError;

  return {
    ok: true,
    bridge: bridge as InternalCrmTrackingBridgeRow,
    publicLeadId: leadResolution.leadId,
  };
}

export async function syncTrackingBridgeFromDeal(input: {
  supabase: any;
  internalDealId: string;
  stageCode?: string | null;
  syncedAt?: string | null;
}): Promise<SyncBridgeResult> {
  const crm = input.supabase.schema('internal_crm');
  const { data: deal, error: dealError } = await crm
    .from('deals')
    .select('id, client_id, owner_user_id, stage_code')
    .eq('id', input.internalDealId)
    .maybeSingle();

  if (dealError) throw dealError;
  if (!deal?.id || !asString(deal.client_id)) {
    return { ok: true, bridge: null, publicLeadId: null, skippedReason: 'deal_not_found' };
  }

  const { data: existingBridge, error: bridgeError } = await crm
    .from('tracking_bridge')
    .select('internal_client_id')
    .eq('internal_client_id', deal.client_id)
    .maybeSingle();
  if (bridgeError) throw bridgeError;

  const { data: client, error: clientError } = await crm
    .from('clients')
    .select('id, source_channel, linked_public_org_id, linked_public_user_id')
    .eq('id', deal.client_id)
    .maybeSingle();
  if (clientError) throw clientError;

  const sourceChannel = asString(client?.source_channel) || '';
  if (!existingBridge?.internal_client_id && sourceChannel !== 'landing_page') {
    return { ok: true, bridge: null, publicLeadId: null, skippedReason: 'bridge_not_initialized' };
  }

  return syncInternalCrmTrackingBridge({
    supabase: input.supabase,
    internalClientId: String(deal.client_id),
    internalDealId: String(deal.id),
    ownerUserId: asString(deal.owner_user_id),
    linkedPublicOrgId: asString(client?.linked_public_org_id),
    linkedPublicUserId: asString(client?.linked_public_user_id),
    stageCode: asString(input.stageCode) || asString(deal.stage_code),
    syncedAt: input.syncedAt,
  });
}

export function buildTrackingSnapshot(raw: Record<string, unknown> | null | undefined): AnyRecord {
  return buildAttributionSnapshot(raw);
}