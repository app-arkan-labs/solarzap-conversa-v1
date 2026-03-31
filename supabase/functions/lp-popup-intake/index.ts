import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveRequestCors } from '../_shared/cors.ts';
import { buildTrackingSnapshot } from '../_shared/internalCrmTrackingBridge.ts';

const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

if (!SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL env');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env');
}

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_IP_MAX = 40;
const RATE_LIMIT_PHONE_MAX = 12;
const STEP_ORDER = ['name', 'phone', 'company', 'email', 'schedule', 'completed'] as const;
const LP_POPUP_NOTIFICATION_EMAIL = String(Deno.env.get('LP_POPUP_NOTIFICATION_EMAIL') || 'app.arkanlabs@gmail.com').trim();
const LOCALHOST_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const TRUSTED_LP_ORIGINS = [
  'https://lp.aceleracao.solarzap.com.br',
  'https://lp.arkanlabs.com.br',
  'https://lp.solarzap.com.br',
];

function json(status: number, body: Record<string, unknown>, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'sim'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'nao'].includes(normalized)) return false;
  }
  return fallback;
}

function normalizePhone(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

function nowIso(): string {
  return new Date().toISOString();
}

function resolveRequestIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const first = forwarded
    .split(',')
    .map((item) => item.trim())
    .find(Boolean);
  return first || null;
}

function mergeRecord(base: unknown, patch: unknown): Record<string, unknown> {
  return {
    ...(isRecord(base) ? base : {}),
    ...(isRecord(patch) ? patch : {}),
  };
}

function resolveNextStep(lastCompletedStep: string | null, hasScheduled: boolean): string {
  if (hasScheduled) return 'completed';
  if (!lastCompletedStep) return 'name';

  const currentIndex = STEP_ORDER.indexOf(lastCompletedStep as (typeof STEP_ORDER)[number]);
  if (currentIndex < 0) return 'name';
  return STEP_ORDER[Math.min(currentIndex + 1, STEP_ORDER.length - 1)];
}

function formatDateTimeForEmail(iso: string | null, timezone: string | null): string {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timezone || 'America/Sao_Paulo',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function sendEmailViaResend(subject: string, html: string, text: string) {
  const resendApiKey = String(Deno.env.get('RESEND_API_KEY') || '').trim();
  if (!resendApiKey) {
    throw new Error('missing_resend_api_key');
  }

  const from = String(Deno.env.get('RESEND_FROM_EMAIL') || 'SolarZap <notificacoes@resend.dev>').trim();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [LP_POPUP_NOTIFICATION_EMAIL],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    throw new Error(`resend_http_${response.status}:${raw}`);
  }
}

async function notifyLeadCreatedBestEffort(input: {
  funnelSlug: string;
  formSessionId: string;
  fullName: string | null;
  companyName: string | null;
  email: string | null;
  phoneNormalized: string | null;
  timezone: string | null;
}) {
  try {
    const createdAtIso = nowIso();
    const createdAtFormatted = formatDateTimeForEmail(createdAtIso, input.timezone);
    const subject = `Novo lead LP criado - ${input.fullName || input.companyName || 'Sem nome'}`;
    const html = [
      '<h2>Novo lead criado pelo formulario LP</h2>',
      `<p><strong>Data/Hora:</strong> ${createdAtFormatted}</p>`,
      `<p><strong>Nome:</strong> ${input.fullName || '-'}</p>`,
      `<p><strong>Empresa:</strong> ${input.companyName || '-'}</p>`,
      `<p><strong>Email:</strong> ${input.email || '-'}</p>`,
      `<p><strong>Telefone:</strong> ${input.phoneNormalized || '-'}</p>`,
      `<p><strong>Funnel:</strong> ${input.funnelSlug}</p>`,
      `<p><strong>Session:</strong> ${input.formSessionId}</p>`,
    ].join('');
    const text = [
      'Novo lead criado pelo formulario LP',
      `Data/Hora: ${createdAtFormatted}`,
      `Nome: ${input.fullName || '-'}`,
      `Empresa: ${input.companyName || '-'}`,
      `Email: ${input.email || '-'}`,
      `Telefone: ${input.phoneNormalized || '-'}`,
      `Funnel: ${input.funnelSlug}`,
      `Session: ${input.formSessionId}`,
    ].join('\n');

    await sendEmailViaResend(subject, html, text);
  } catch (error) {
    console.warn('[lp-popup-intake] lead notification failed', error);
  }
}

async function notifyBookingCreatedBestEffort(input: {
  funnelSlug: string;
  formSessionId: string;
  fullName: string | null;
  companyName: string | null;
  email: string | null;
  phoneNormalized: string | null;
  timezone: string | null;
  scheduledAt: string | null;
}) {
  try {
    const scheduledAtFormatted = formatDateTimeForEmail(input.scheduledAt, input.timezone);
    const subject = `Agendamento LP confirmado - ${input.fullName || input.companyName || 'Sem nome'}`;
    const html = [
      '<h2>Novo agendamento confirmado no formulario LP</h2>',
      `<p><strong>Data/Hora agendada:</strong> ${scheduledAtFormatted}</p>`,
      `<p><strong>Nome:</strong> ${input.fullName || '-'}</p>`,
      `<p><strong>Empresa:</strong> ${input.companyName || '-'}</p>`,
      `<p><strong>Email:</strong> ${input.email || '-'}</p>`,
      `<p><strong>Telefone:</strong> ${input.phoneNormalized || '-'}</p>`,
      `<p><strong>Funnel:</strong> ${input.funnelSlug}</p>`,
      `<p><strong>Session:</strong> ${input.formSessionId}</p>`,
    ].join('');
    const text = [
      'Novo agendamento confirmado no formulario LP',
      `Data/Hora agendada: ${scheduledAtFormatted}`,
      `Nome: ${input.fullName || '-'}`,
      `Empresa: ${input.companyName || '-'}`,
      `Email: ${input.email || '-'}`,
      `Telefone: ${input.phoneNormalized || '-'}`,
      `Funnel: ${input.funnelSlug}`,
      `Session: ${input.formSessionId}`,
    ].join('\n');

    await sendEmailViaResend(subject, html, text);
  } catch (error) {
    console.warn('[lp-popup-intake] booking notification failed', error);
  }
}

async function getFunnelConfig(funnelSlug: string) {
  const { data, error } = await serviceClient
    .schema('internal_crm')
    .from('landing_form_funnels')
    .select('*')
    .eq('funnel_slug', funnelSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw { status: 500, code: 'landing_funnel_query_failed', error };
  }

  if (!data?.funnel_slug) {
    throw { status: 404, code: 'landing_funnel_not_found' };
  }

  return data as Record<string, unknown>;
}

function ensureOriginAllowedForFunnel(req: Request, funnel: Record<string, unknown>) {
  const requestOrigin = asString(req.headers.get('origin'));
  const normalizedOrigin = requestOrigin ? requestOrigin.replace(/\/+$/, '') : null;

  if (normalizedOrigin && LOCALHOST_ORIGIN_REGEX.test(normalizedOrigin)) return;

  const allowedOrigins = new Set<string>([
    ...TRUSTED_LP_ORIGINS,
    ...(Array.isArray(funnel.allowed_origins)
      ? funnel.allowed_origins.map((origin) => String(origin || '').trim()).filter(Boolean)
      : []),
  ]);

  if (!normalizedOrigin || allowedOrigins.size < 1) return;
  if (!allowedOrigins.has(normalizedOrigin)) {
    throw { status: 403, code: 'forbidden_origin' };
  }
}

async function getSession(formSessionId: string) {
  const { data, error } = await serviceClient
    .schema('internal_crm')
    .from('landing_form_sessions')
    .select('*')
    .eq('form_session_id', formSessionId)
    .maybeSingle();

  if (error) {
    throw { status: 500, code: 'landing_session_query_failed', error };
  }

  return data as Record<string, unknown> | null;
}

async function enforceRateLimit(ipAddress: string | null, phoneNormalized: string | null) {
  const windowStartIso = new Date(Date.now() - (RATE_LIMIT_WINDOW_MINUTES * 60_000)).toISOString();

  if (ipAddress) {
    const { count, error } = await serviceClient
      .schema('internal_crm')
      .from('landing_form_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ipAddress)
      .gte('updated_at', windowStartIso);

    if (error) throw { status: 500, code: 'landing_rate_limit_query_failed', error };
    if ((count || 0) >= RATE_LIMIT_IP_MAX) {
      throw { status: 429, code: 'rate_limit_exceeded' };
    }
  }

  if (phoneNormalized) {
    const { count, error } = await serviceClient
      .schema('internal_crm')
      .from('landing_form_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('phone_normalized', phoneNormalized)
      .gte('updated_at', windowStartIso);

    if (error) throw { status: 500, code: 'landing_rate_limit_query_failed', error };
    if ((count || 0) >= RATE_LIMIT_PHONE_MAX) {
      throw { status: 429, code: 'rate_limit_exceeded' };
    }
  }
}

async function upsertSession(input: {
  existingSession: Record<string, unknown> | null;
  formSessionId: string;
  funnelSlug: string;
  buttonContext: Record<string, unknown>;
  phoneNormalized: string | null;
  fullName: string | null;
  companyName: string | null;
  email: string | null;
  currentStep: string | null;
  lastCompletedStep: string | null;
  isAbandoned: boolean;
  trackingPayload: Record<string, unknown>;
  landingPageUrl: string | null;
  referrerUrl: string | null;
  rawQuerystring: string | null;
  sessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  locale: string | null;
  timezone: string | null;
  internalClientId?: string | null;
  internalDealId?: string | null;
  internalAppointmentId?: string | null;
  scheduledAt?: string | null;
  lastPayload?: Record<string, unknown>;
}) {
  const hasScheduled = Boolean(input.internalAppointmentId || input.scheduledAt || asString(input.existingSession?.scheduled_at));
  const nextStatus = hasScheduled
    ? 'scheduled'
    : input.isAbandoned
      ? 'abandoned'
      : input.phoneNormalized
        ? 'in_progress'
        : 'draft';

  const row = {
    id: asString(input.existingSession?.id) || undefined,
    form_session_id: input.formSessionId,
    funnel_slug: input.funnelSlug,
    button_context: input.buttonContext,
    phone_normalized: input.phoneNormalized,
    full_name: input.fullName,
    company_name: input.companyName,
    email: input.email,
    current_step: input.currentStep,
    last_completed_step: input.lastCompletedStep,
    status: nextStatus,
    is_abandoned: input.isAbandoned,
    abandoned_at: input.isAbandoned ? nowIso() : null,
    internal_client_id: input.internalClientId || asString(input.existingSession?.internal_client_id),
    internal_deal_id: input.internalDealId || asString(input.existingSession?.internal_deal_id),
    internal_appointment_id: input.internalAppointmentId || asString(input.existingSession?.internal_appointment_id),
    tracking_payload: input.trackingPayload,
    landing_page_url: input.landingPageUrl,
    referrer_url: input.referrerUrl,
    raw_querystring: input.rawQuerystring,
    session_id: input.sessionId,
    ip_address: input.ipAddress,
    user_agent: input.userAgent,
    locale: input.locale,
    timezone: input.timezone,
    scheduled_at: input.scheduledAt || asString(input.existingSession?.scheduled_at),
    last_payload: input.lastPayload || {},
    updated_at: nowIso(),
  };

  const { data, error } = await serviceClient
    .schema('internal_crm')
    .from('landing_form_sessions')
    .upsert(row, { onConflict: 'form_session_id' })
    .select('*')
    .single();

  if (error || !data?.id) {
    throw { status: 500, code: 'landing_session_upsert_failed', error };
  }

  return data as Record<string, unknown>;
}

async function invokeInternalCrmApi(action: string, payload: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/internal-crm-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      action,
      ...payload,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !isRecord(body) || body.ok === false) {
    throw {
      status: response.status || 500,
      code: asString(body.code) || 'internal_crm_api_failed',
      message: asString(body.message),
    };
  }

  return body as Record<string, unknown>;
}

async function handleSaveStep(req: Request, payload: Record<string, unknown>, headers: Record<string, string>) {
  const formSessionId = asString(payload.form_session_id);
  if (!formSessionId) throw { status: 400, code: 'invalid_payload' };

  const existingSession = await getSession(formSessionId);
  const funnelSlug = asString(payload.funnel_slug) || asString(existingSession?.funnel_slug);
  if (!funnelSlug) throw { status: 400, code: 'invalid_payload' };

  const funnel = await getFunnelConfig(funnelSlug);
  ensureOriginAllowedForFunnel(req, funnel);

  const leadInput = isRecord(payload.lead) ? payload.lead : {};
  const progressInput = isRecord(payload.progress) ? payload.progress : {};
  const buttonContext = mergeRecord(existingSession?.button_context, payload.button_context);
  const trackingPayload = mergeRecord(
    existingSession?.tracking_payload,
    buildTrackingSnapshot(isRecord(payload.tracking) ? payload.tracking : null),
  );

  const phoneNormalized = normalizePhone(leadInput.phone || existingSession?.phone_normalized);
  await enforceRateLimit(resolveRequestIp(req), phoneNormalized || null);

  const fullName = asString(leadInput.full_name) || asString(existingSession?.full_name);
  const companyName = asString(leadInput.company) || asString(existingSession?.company_name);
  const email = asString(leadInput.email) || asString(existingSession?.email);
  const currentStep = asString(progressInput.current_step) || asString(existingSession?.current_step);
  const lastCompletedStep = asString(progressInput.last_completed_step) || asString(existingSession?.last_completed_step);
  const isAbandoned = asBoolean(progressInput.is_abandoned, false);

  let savedSession = await upsertSession({
    existingSession,
    formSessionId,
    funnelSlug,
    buttonContext,
    phoneNormalized: phoneNormalized || null,
    fullName,
    companyName,
    email,
    currentStep,
    lastCompletedStep,
    isAbandoned,
    trackingPayload,
    landingPageUrl: asString(trackingPayload.landing_page_url) || asString(existingSession?.landing_page_url),
    referrerUrl: asString(trackingPayload.referrer_url) || asString(existingSession?.referrer_url),
    rawQuerystring: asString(trackingPayload.raw_querystring) || asString(existingSession?.raw_querystring),
    sessionId: asString(trackingPayload.session_id) || asString(existingSession?.session_id),
    ipAddress: resolveRequestIp(req),
    userAgent: req.headers.get('user-agent'),
    locale: asString(trackingPayload.locale) || asString(existingSession?.locale),
    timezone: asString(trackingPayload.timezone) || asString(existingSession?.timezone),
    lastPayload: payload,
  });

  if (!phoneNormalized) {
    return json(200, {
      ok: true,
      form_session_id: formSessionId,
      status: asString(savedSession.status) || 'draft',
      next_step: resolveNextStep(lastCompletedStep, false),
    }, headers);
  }

  const suppressAutomation = Boolean(
    asString(savedSession.internal_client_id) || asString(existingSession?.internal_client_id),
  );
  const hadInternalClientBeforeIntake = Boolean(
    asString(savedSession.internal_client_id) || asString(existingSession?.internal_client_id),
  );
  const intakeResult = await invokeInternalCrmApi('lp_public_intake', {
    funnel_slug: funnelSlug,
    form_session_id: formSessionId,
    suppress_automation: suppressAutomation,
    company_name: companyName || fullName || 'Lead LP',
    primary_contact_name: fullName || companyName || 'Lead LP',
    primary_phone: phoneNormalized,
    primary_email: email,
    tracking: trackingPayload,
  });

  savedSession = await upsertSession({
    existingSession: savedSession,
    formSessionId,
    funnelSlug,
    buttonContext,
    phoneNormalized,
    fullName,
    companyName,
    email,
    currentStep,
    lastCompletedStep,
    isAbandoned,
    trackingPayload,
    landingPageUrl: asString(trackingPayload.landing_page_url) || asString(savedSession.landing_page_url),
    referrerUrl: asString(trackingPayload.referrer_url) || asString(savedSession.referrer_url),
    rawQuerystring: asString(trackingPayload.raw_querystring) || asString(savedSession.raw_querystring),
    sessionId: asString(trackingPayload.session_id) || asString(savedSession.session_id),
    ipAddress: resolveRequestIp(req),
    userAgent: req.headers.get('user-agent'),
    locale: asString(trackingPayload.locale) || asString(savedSession.locale),
    timezone: asString(trackingPayload.timezone) || asString(savedSession.timezone),
    internalClientId: asString(intakeResult.client?.id),
    internalDealId: asString(intakeResult.deal?.id),
    internalAppointmentId: asString(intakeResult.appointment?.id),
    scheduledAt: asString(intakeResult.appointment?.start_at),
    lastPayload: payload,
  });

  if (!hadInternalClientBeforeIntake && Boolean(asString(savedSession.internal_client_id))) {
    await notifyLeadCreatedBestEffort({
      funnelSlug,
      formSessionId,
      fullName,
      companyName,
      email,
      phoneNormalized: phoneNormalized || null,
      timezone: asString(trackingPayload.timezone) || asString(savedSession.timezone),
    });
  }

  return json(200, {
    ok: true,
    form_session_id: formSessionId,
    internal_client_id: asString(savedSession.internal_client_id),
    internal_deal_id: asString(savedSession.internal_deal_id),
    stage_code: asString(intakeResult.deal?.stage_code) || 'novo_lead',
    resume_message_queued: !suppressAutomation && Array.isArray(intakeResult.automation) && intakeResult.automation.length > 0,
    next_step: resolveNextStep(lastCompletedStep, Boolean(asString(savedSession.internal_appointment_id))),
  }, headers);
}

async function handleListSlots(req: Request, payload: Record<string, unknown>, headers: Record<string, string>) {
  const formSessionId = asString(payload.form_session_id);
  if (!formSessionId) throw { status: 400, code: 'invalid_payload' };

  const session = await getSession(formSessionId);
  if (!session?.id) throw { status: 404, code: 'landing_session_not_found' };

  const funnelSlug = asString(payload.funnel_slug) || asString(session.funnel_slug);
  if (!funnelSlug) throw { status: 400, code: 'invalid_payload' };

  const funnel = await getFunnelConfig(funnelSlug);
  ensureOriginAllowedForFunnel(req, funnel);

  const result = await invokeInternalCrmApi('lp_public_list_slots', {
    funnel_slug: funnelSlug,
    appointment_type: asString(payload.appointment_type) || asString(funnel.appointment_type) || 'call',
    duration_minutes: payload.duration_minutes,
    timezone: asString(payload.timezone) || asString(session.timezone) || asString(funnel.timezone),
    limit: payload.limit,
    lookahead_days: payload.lookahead_days,
  });

  await upsertSession({
    existingSession: session,
    formSessionId,
    funnelSlug,
    buttonContext: mergeRecord(session.button_context, null),
    phoneNormalized: asString(session.phone_normalized),
    fullName: asString(session.full_name),
    companyName: asString(session.company_name),
    email: asString(session.email),
    currentStep: 'schedule',
    lastCompletedStep: asString(session.last_completed_step),
    isAbandoned: false,
    trackingPayload: isRecord(session.tracking_payload) ? session.tracking_payload : {},
    landingPageUrl: asString(session.landing_page_url),
    referrerUrl: asString(session.referrer_url),
    rawQuerystring: asString(session.raw_querystring),
    sessionId: asString(session.session_id),
    ipAddress: resolveRequestIp(req),
    userAgent: req.headers.get('user-agent'),
    locale: asString(session.locale),
    timezone: asString(result.timezone) || asString(session.timezone),
    internalClientId: asString(session.internal_client_id),
    internalDealId: asString(session.internal_deal_id),
    internalAppointmentId: asString(session.internal_appointment_id),
    scheduledAt: asString(session.scheduled_at),
    lastPayload: payload,
  });

  return json(200, {
    ok: true,
    timezone: asString(result.timezone),
    appointment_type: asString(result.appointment_type),
    duration_minutes: result.duration_minutes,
    slots: Array.isArray(result.slots) ? result.slots : [],
  }, headers);
}

async function handleBookSlot(req: Request, payload: Record<string, unknown>, headers: Record<string, string>) {
  const formSessionId = asString(payload.form_session_id);
  const appointmentStartAt = asString(payload.appointment_start_at);
  if (!formSessionId || !appointmentStartAt) throw { status: 400, code: 'invalid_payload' };

  const session = await getSession(formSessionId);
  if (!session?.id) throw { status: 404, code: 'landing_session_not_found' };
  if (!asString(session.internal_client_id) || !asString(session.internal_deal_id)) {
    throw { status: 409, code: 'landing_session_not_ready' };
  }

  const funnelSlug = asString(payload.funnel_slug) || asString(session.funnel_slug);
  if (!funnelSlug) throw { status: 400, code: 'invalid_payload' };

  const funnel = await getFunnelConfig(funnelSlug);
  ensureOriginAllowedForFunnel(req, funnel);

  const trackingPayload = mergeRecord(
    session.tracking_payload,
    buildTrackingSnapshot(isRecord(payload.tracking) ? payload.tracking : null),
  );

  const result = await invokeInternalCrmApi('lp_public_book_slot', {
    funnel_slug: funnelSlug,
    form_session_id: formSessionId,
    client_id: asString(session.internal_client_id),
    deal_id: asString(session.internal_deal_id),
    appointment_start_at: appointmentStartAt,
    appointment_type: asString(payload.appointment_type) || asString(funnel.appointment_type) || 'call',
    duration_minutes: payload.duration_minutes,
    timezone: asString(payload.timezone) || asString(session.timezone) || asString(funnel.timezone),
    tracking: trackingPayload,
  });

  const whatsappPhone = normalizePhone(funnel.whatsapp_phone || '5514991402780');
  const whatsappText = encodeURIComponent('Oi! Quero vender mais projetos de energia solar.');
  const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${whatsappText}`;

  try {
    await upsertSession({
      existingSession: session,
      formSessionId,
      funnelSlug,
      buttonContext: isRecord(session.button_context) ? session.button_context : {},
      phoneNormalized: asString(session.phone_normalized),
      fullName: asString(session.full_name),
      companyName: asString(session.company_name),
      email: asString(session.email),
      currentStep: 'schedule',
      lastCompletedStep: 'schedule',
      isAbandoned: false,
      trackingPayload,
      landingPageUrl: asString(session.landing_page_url),
      referrerUrl: asString(session.referrer_url),
      rawQuerystring: asString(session.raw_querystring),
      sessionId: asString(session.session_id),
      ipAddress: resolveRequestIp(req),
      userAgent: req.headers.get('user-agent'),
      locale: asString(session.locale),
      timezone: asString(payload.timezone) || asString(session.timezone) || asString(funnel.timezone),
      internalClientId: asString(session.internal_client_id),
      internalDealId: asString(session.internal_deal_id),
      internalAppointmentId: asString(result.appointment?.id),
      scheduledAt: asString(result.appointment?.start_at) || appointmentStartAt,
      lastPayload: payload,
    });
  } catch (error) {
    console.warn('[lp-popup-intake] booking session persistence failed (non-blocking)', error);
  }

  await notifyBookingCreatedBestEffort({
    funnelSlug,
    formSessionId,
    fullName: asString(session.full_name),
    companyName: asString(session.company_name),
    email: asString(session.email),
    phoneNormalized: asString(session.phone_normalized),
    timezone: asString(payload.timezone) || asString(session.timezone) || asString(funnel.timezone),
    scheduledAt: asString(result.appointment?.start_at) || appointmentStartAt,
  });

  return json(200, {
    ok: true,
    internal_client_id: asString(session.internal_client_id),
    internal_deal_id: asString(session.internal_deal_id),
    appointment_id: asString(result.appointment?.id),
    stage_code: asString(result.stage_code) || 'agendou_reuniao',
    meeting_link: asString(result.meeting_link),
    scheduled_at: asString(result.appointment?.start_at) || appointmentStartAt,
    whatsapp_url: whatsappUrl,
  }, headers);
}

Deno.serve(async (req: Request) => {
  const cors = resolveRequestCors(req, { allowLocalhost: true });
  const headers = cors.corsHeaders;

  if (req.method === 'OPTIONS') {
    if (cors.missingAllowedOriginConfig) {
      return json(500, { ok: false, code: 'missing_allowed_origin' }, headers);
    }
    if (!cors.originAllowed) {
      return json(403, { ok: false, code: 'forbidden_origin' }, headers);
    }
    return new Response('ok', { headers });
  }

  if (cors.missingAllowedOriginConfig) {
    return json(500, { ok: false, code: 'missing_allowed_origin' }, headers);
  }

  if (!cors.originAllowed) {
    return json(403, { ok: false, code: 'forbidden_origin' }, headers);
  }

  if (req.method !== 'POST') {
    return json(405, { ok: false, code: 'method_not_allowed' }, headers);
  }

  try {
    const rawPayload = await req.json().catch(() => ({}));
    const payload = isRecord(rawPayload) ? rawPayload : {};
    const action = asString(payload.action);
    if (!action) throw { status: 400, code: 'invalid_payload' };

    if (action === 'save_step') {
      return await handleSaveStep(req, payload, headers);
    }

    if (action === 'list_slots') {
      return await handleListSlots(req, payload, headers);
    }

    if (action === 'book_slot') {
      return await handleBookSlot(req, payload, headers);
    }

    throw { status: 403, code: 'action_not_allowed' };
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === 'number'
      ? Number((error as { status: number }).status)
      : 500;
    const code = asString((error as { code?: unknown })?.code) || 'unknown_lp_popup_intake_error';
    const message = asString((error as { message?: unknown })?.message) || (error instanceof Error ? error.message : null);
    return json(status, {
      ok: false,
      code,
      message,
    }, headers);
  }
});