import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const assert = (name, condition, details) => {
  const ok = Boolean(condition);
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${details ? ` -> ${details}` : ''}`);
  if (!ok) process.exitCode = 1;
  return ok;
};

const META_TAG = '[[LEAD_META_JSON]]';
const rand = (n = 8) => Math.random().toString(16).slice(2, 2 + n);

async function main() {
  const email = `smoke.proposal.rls.${Date.now()}.${rand(6)}@example.com`;
  const password = `S!moke_${Date.now()}_${rand(10)}`;
  let userId = null;
  let leadId = null;
  let propostaId = null;
  let versionId = null;
  let sectionId = null;
  let eventId = null;

  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { smoke_test: true },
    });
    assert('create auth user', !createErr && created?.user?.id, createErr?.message);
    userId = created?.user?.id || null;
    if (!userId) return;

    const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
    assert('sign in', !signInErr && signIn?.session?.access_token, signInErr?.message);
    if (!signIn?.session?.access_token) return;

    const phone = `55119999${Math.floor(1000 + Math.random() * 8999)}`;

    const obs = `${META_TAG}:${JSON.stringify({ tipo_cliente: 'residencial', cidade: 'São Paulo', uf: 'SP' })}`;

    const { data: lead, error: leadErr } = await anon
      .from('leads')
      .insert({
        user_id: userId,
        nome: 'SMOKE_RLS_LEAD',
        telefone: phone,
        canal: 'whatsapp',
        status_pipeline: 'respondeu',
        consumo_kwh: 450,
        valor_estimado: 25000,
        observacoes: obs,
        ai_enabled: true,
      })
      .select('id')
      .single();

    assert('insert lead (authed)', !leadErr && lead?.id, leadErr?.message);
    leadId = lead?.id ?? null;
    if (!leadId) return;

    const { data: proposta, error: propErr } = await anon
      .from('propostas')
      .insert({
        lead_id: Number(leadId),
        user_id: userId,
        valor_projeto: 25000,
        consumo_kwh: 450,
        potencia_kw: 4.2,
        paineis_qtd: 8,
        economia_mensal: 450,
        payback_anos: 4.7,
        status: 'Enviada',
      })
      .select('id')
      .single();

    assert('insert propostas (authed)', !propErr && proposta?.id, propErr?.message);
    propostaId = proposta?.id ?? null;
    if (!propostaId) return;

    const { data: version, error: verErr } = await anon
      .from('proposal_versions')
      .insert({
        proposta_id: Number(propostaId),
        lead_id: Number(leadId),
        user_id: userId,
        org_id: userId,
        version_no: 1,
        status: 'sent',
        segment: 'residencial',
        source: 'manual',
        premium_payload: { smoke: true },
        context_snapshot: { smoke: true, lead_id: leadId },
      })
      .select('id')
      .single();

    assert('insert proposal_versions (RLS)', !verErr && version?.id, verErr?.message);
    versionId = version?.id ?? null;
    if (!versionId) return;

    const { data: section, error: secErr } = await anon
      .from('proposal_sections')
      .insert({
        proposal_version_id: versionId,
        user_id: userId,
        org_id: userId,
        section_key: 'executive_summary',
        section_title: 'Resumo Executivo',
        section_order: 10,
        content: { text: 'SMOKE: resumo executivo' },
        source: 'manual',
      })
      .select('id')
      .single();

    assert('insert proposal_sections (RLS)', !secErr && section?.id, secErr?.message);
    sectionId = section?.id ?? null;

    const { data: event, error: evErr } = await anon
      .from('proposal_delivery_events')
      .insert({
        proposal_version_id: versionId,
        proposta_id: Number(propostaId),
        lead_id: Number(leadId),
        user_id: userId,
        channel: 'crm',
        event_type: 'generated',
        metadata: { smoke: true },
      })
      .select('id')
      .single();

    assert('insert proposal_delivery_events (RLS)', !evErr && event?.id, evErr?.message);
    eventId = event?.id ?? null;

    const { data: versionsRead, error: readErr } = await anon
      .from('proposal_versions')
      .select('id')
      .eq('id', versionId)
      .limit(1);
    assert('select proposal_versions (RLS)', !readErr && Array.isArray(versionsRead) && versionsRead.length === 1, readErr?.message);

    const { data: sectionsRead, error: readSecErr } = await anon
      .from('proposal_sections')
      .select('id')
      .eq('id', sectionId)
      .limit(1);
    assert('select proposal_sections (RLS)', !readSecErr && Array.isArray(sectionsRead) && sectionsRead.length === 1, readSecErr?.message);

    const { data: eventsRead, error: readEvErr } = await anon
      .from('proposal_delivery_events')
      .select('id')
      .eq('id', eventId)
      .limit(1);
    assert('select proposal_delivery_events (RLS)', !readEvErr && Array.isArray(eventsRead) && eventsRead.length === 1, readEvErr?.message);
  } finally {
    if (eventId) await admin.from('proposal_delivery_events').delete().eq('id', eventId);
    if (sectionId) await admin.from('proposal_sections').delete().eq('id', sectionId);
    if (versionId) await admin.from('proposal_versions').delete().eq('id', versionId);
    if (propostaId) await admin.from('propostas').delete().eq('id', propostaId);
    if (leadId) await admin.from('leads').delete().eq('id', leadId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }

  if (process.exitCode) process.exit(1);
}

main().catch((err) => {
  console.error('Smoke failed with exception:', err);
  process.exit(1);
});
