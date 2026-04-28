import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveRequestCors } from '../_shared/cors.ts';
import {
  buildContractCommercialSummary,
  buildInitialContractValues,
  createContractEventEntry,
} from '../_shared/contractEmbedDraft.ts';
import {
  sha256Hex,
  signContractEmbedToken,
  type ContractEmbedTokenPayload,
} from '../_shared/contractEmbedToken.ts';

/**
 * contract-embed-public-link
 *
 * Public endpoint callable from static sites (e.g. apresentacao.arkanlabs.com.br).
 * Does NOT require x-contract-embed-secret — instead validates:
 *   1. CORS origin must be in ALLOWED_ORIGINS
 *   2. Origin header must match an entry in PUBLIC_EMBED_ALLOWED_ORIGINS (stricter allowlist)
 *   3. orgId + sellerUserId are provided and valid
 *
 * Returns { iframeUrl, draftId, sessionId, expiresAt }
 */

const asString = (value: unknown, max = 1200): string =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const PUBLIC_EMBED_ORIGINS_DEFAULT = 'https://apresentacao.arkanlabs.com.br';

const parsePublicOrigins = (): string[] => {
  const raw = String(
    Deno.env.get('PUBLIC_EMBED_ALLOWED_ORIGINS') || PUBLIC_EMBED_ORIGINS_DEFAULT,
  ).trim();
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
};

Deno.serve(async (req) => {
  const cors = resolveRequestCors(req);
  const corsHeaders = cors.corsHeaders;

  if (req.method === 'OPTIONS') {
    if (cors.missingAllowedOriginConfig) {
      return new Response(JSON.stringify({ error: 'missing_allowed_origin' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!cors.originAllowed) {
      return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const embedSecret = Deno.env.get('CONTRACT_EMBED_SHARED_SECRET') || '';
    const publicEmbedBaseUrl =
      asString(Deno.env.get('CONTRACT_EMBED_PUBLIC_BASE_URL'), 255) ||
      'https://app.solarzap.com.br';

    if (!supabaseUrl || !supabaseServiceRole || !embedSecret) {
      return new Response(JSON.stringify({ error: 'missing_required_env' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Origin validation (public endpoint security) ---
    const requestOrigin = (req.headers.get('origin') || '').trim().replace(/\/+$/, '');
    const publicOrigins = parsePublicOrigins();
    if (!requestOrigin || !publicOrigins.includes(requestOrigin)) {
      return new Response(
        JSON.stringify({ error: 'origin_not_allowed', allowed: publicOrigins }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceRole);
    const body = await req.json().catch(() => ({}));

    const orgId = asString(body?.orgId, 120);
    const sellerUserId = asString(body?.sellerUserId, 120);
    const leadId = asString(body?.leadId, 120);
    const opportunityId = asString(body?.opportunityId, 120);
    const allowedOrigin = requestOrigin;
    const ttlMinutes = clampInt(body?.ttlMinutes, 240, 15, 1440);
    const prefill =
      body?.prefill && typeof body.prefill === 'object'
        ? (body.prefill as Record<string, unknown>)
        : {};
    const lockFields = Array.isArray(body?.lockFields)
      ? body.lockFields.map((item: unknown) => asString(item, 120)).filter(Boolean)
      : [];

    if (!orgId || !sellerUserId) {
      return new Response(JSON.stringify({ error: 'missing_org_or_seller' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate seller belongs to org
    const { data: membership, error: membershipError } = await admin
      .from('organization_members')
      .select('org_id, user_id')
      .eq('org_id', orgId)
      .eq('user_id', sellerUserId)
      .maybeSingle();

    if (membershipError) {
      return new Response(
        JSON.stringify({ error: 'membership_lookup_failed', message: membershipError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!membership?.org_id) {
      return new Response(JSON.stringify({ error: 'seller_not_in_org' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prefillSnapshot = { ...prefill, sellerUserId, lockFields };

    // Create draft
    const { data: insertedDraft, error: insertDraftError } = await admin
      .from('contract_drafts')
      .insert({
        org_id: orgId,
        lead_id: leadId ? Number(leadId) : null,
        opportunity_id: opportunityId ? Number(opportunityId) : null,
        template_version: 'solarzap_contract_real_v2',
        contract_status: 'draft',
        signature_status: 'not_requested',
        generated_from: 'landing_embed',
        source_context: {
          sourceContext: 'apresentacao_arkanlabs',
          generatedFrom: 'public_embed_link',
          embedOrigin: allowedOrigin,
          embedSource: 'public_embed',
          salesSessionId: asString(prefill?.salesSessionId, 120),
          prefillLockedFields: lockFields,
        },
        embed_origin: allowedOrigin,
        embed_source: 'public_embed',
        sales_session_id: asString(prefill?.salesSessionId, 120) || null,
        seller_user_id: sellerUserId,
        created_by_user_id: sellerUserId,
        last_updated_by_user_id: sellerUserId,
        legal_data: {},
        internal_metadata: {},
        commercial_summary: {},
        plan_snapshot: {},
        special_condition_snapshot: {},
        payment_snapshot: {},
        recurrence_snapshot: {},
        placeholder_snapshot: {},
      })
      .select('id, contract_number')
      .single();

    if (insertDraftError || !insertedDraft?.id) {
      return new Response(
        JSON.stringify({ error: 'draft_insert_failed', message: insertDraftError?.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const initialValues = buildInitialContractValues({
      draftId: insertedDraft.id,
      contractNumber: insertedDraft.contract_number,
      orgId,
      sellerUserId,
      leadId,
      opportunityId,
      allowedOrigin,
      prefill: prefillSnapshot,
    });

    const createdEvent = createContractEventEntry(initialValues as any, {
      type: 'contract_created',
      userId: sellerUserId,
      previousStatus: null,
      nextStatus: 'draft',
      message: 'Contrato draft criado via emissao publica de sessao embed.',
    });

    const internalMetadata = {
      ...initialValues.internalMetadata,
      eventLog: [createdEvent],
    };

    const { error: draftUpdateError } = await admin
      .from('contract_drafts')
      .update({
        legal_data: initialValues.legalData,
        internal_metadata: internalMetadata,
        commercial_summary: buildContractCommercialSummary(initialValues as any),
        plan_snapshot: initialValues.legalData.plano,
        special_condition_snapshot: initialValues.legalData.condicaoEspecial,
        payment_snapshot: initialValues.legalData.pagamento,
        recurrence_snapshot: initialValues.legalData.recorrencia,
        checksum_hash: initialValues.internalMetadata.checksumHash,
      })
      .eq('id', insertedDraft.id)
      .eq('org_id', orgId);

    if (draftUpdateError) {
      return new Response(
        JSON.stringify({ error: 'draft_update_failed', message: draftUpdateError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Create embed session with signed token
    const exp = Math.floor(Date.now() / 1000) + ttlMinutes * 60;
    const tokenPayload: ContractEmbedTokenPayload = {
      session_id: crypto.randomUUID(),
      draft_id: insertedDraft.id,
      org_id: orgId,
      exp,
    };
    const token = await signContractEmbedToken(tokenPayload, embedSecret);
    const tokenHash = await sha256Hex(token);
    const expiresAtIso = new Date(exp * 1000).toISOString();

    const { error: sessionError } = await admin.from('contract_embed_sessions').insert({
      id: tokenPayload.session_id,
      contract_draft_id: insertedDraft.id,
      org_id: orgId,
      seller_user_id: sellerUserId,
      status: 'active',
      allowed_origin: allowedOrigin,
      prefill_snapshot: prefillSnapshot,
      token_hash: tokenHash,
      expires_at: expiresAtIso,
    });

    if (sessionError) {
      return new Response(
        JSON.stringify({ error: 'session_insert_failed', message: sessionError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Audit event
    await admin.from('contract_events').insert({
      contract_draft_id: insertedDraft.id,
      org_id: orgId,
      user_id: sellerUserId,
      event_type: 'contract_created',
      previous_status: null,
      next_status: 'draft',
      payload: {
        message: 'Contrato criado via emissao publica de sessao embed.',
        allowed_origin: allowedOrigin,
        source: 'contract-embed-public-link',
      },
    });

    return new Response(
      JSON.stringify({
        draftId: insertedDraft.id,
        sessionId: tokenPayload.session_id,
        token,
        expiresAt: expiresAtIso,
        iframeUrl: `${publicEmbedBaseUrl.replace(/\/+$/, '')}/embed/contracts?token=${encodeURIComponent(token)}`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('contract-embed-public-link error:', error);
    return new Response(
      JSON.stringify({ error: 'internal_error', message }),
      {
        status: 500,
        headers: {
          ...resolveRequestCors(req).corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});
