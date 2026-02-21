import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const out = {};
  if (!fs.existsSync('.env')) return out;
  const raw = fs.readFileSync('.env', 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const fileEnv = loadEnv();
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || fileEnv.SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('FAIL: missing SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let failed = false;
function report(name, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  const suffix = detail ? ` -> ${detail}` : '';
  console.log(`${status}: ${name}${suffix}`);
  if (!ok) failed = true;
}

const rand = (n = 8) => Math.random().toString(16).slice(2, 2 + n);

async function main() {
  let userId = null;
  let orgId = null;
  let leadId = null;
  let propostaId = null;
  let versionId = null;

  try {
    const { data: member, error: memberErr } = await admin
      .from('organization_members')
      .select('org_id')
      .limit(1)
      .maybeSingle();

    report('org lookup', !memberErr && !!member?.org_id, memberErr?.message || '');
    if (!member?.org_id) return;
    orgId = member.org_id;

    const email = `smoke.proposal.rpc.${Date.now()}.${rand(6)}@example.test`;
    const password = `Smk!${Date.now()}_${rand(8)}`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { smoke: true },
    });
    report('create auth user', !createErr && !!created?.user?.id, createErr?.message || '');
    if (!created?.user?.id) return;
    userId = created.user.id;

    const { error: memberInsertErr } = await admin
      .from('organization_members')
      .insert({
        org_id: orgId,
        user_id: userId,
        role: 'user',
      });
    report('insert org membership', !memberInsertErr, memberInsertErr?.message || '');
    if (memberInsertErr) return;

    const { data: lead, error: leadErr } = await admin
      .from('leads')
      .insert({
        org_id: orgId,
        user_id: userId,
        nome: 'SMOKE PROPOSTA RPC',
        telefone: '11999999999',
        phone_e164: '5511999999999',
        canal: 'whatsapp',
        status_pipeline: 'aguardando_proposta',
      })
      .select('id')
      .single();
    report('insert lead', !leadErr && !!lead?.id, leadErr?.message || '');
    if (!lead?.id) return;
    leadId = lead.id;

    const { data: proposta, error: propostaErr } = await admin
      .from('propostas')
      .insert({
        org_id: orgId,
        user_id: userId,
        lead_id: Number(leadId),
        valor_projeto: 12345,
        status: 'Enviada',
      })
      .select('id')
      .single();
    report('insert proposta', !propostaErr && !!proposta?.id, propostaErr?.message || '');
    if (!proposta?.id) return;
    propostaId = proposta.id;

    const { data: version, error: versionErr } = await admin
      .from('proposal_versions')
      .insert({
        org_id: orgId,
        user_id: userId,
        lead_id: Number(leadId),
        proposta_id: Number(propostaId),
        version_no: 1,
        status: 'sent',
        segment: 'residencial',
        source: 'manual',
        premium_payload: {
          public_pdf_url: 'https://example.test/public.pdf',
          share_url: 'https://example.test/share',
        },
      })
      .select('id')
      .single();
    report('insert proposal_version', !versionErr && !!version?.id, versionErr?.message || '');
    if (!version?.id) return;
    versionId = version.id;

    const authed = createClient(SUPABASE_URL, ANON_KEY);
    const { error: signInErr } = await authed.auth.signInWithPassword({ email, password });
    report('sign in temp user', !signInErr, signInErr?.message || '');
    if (signInErr) return;

    const listRes = await authed.rpc('list_proposals', {
      p_org_id: orgId,
      p_search: null,
      p_status: null,
      p_stage: null,
      p_owner: null,
      p_date_from: null,
      p_date_to: null,
      p_limit: 50,
      p_offset: 0,
    });
    report(
      'rpc list_proposals',
      !listRes.error && Array.isArray(listRes.data) && listRes.data.some((r) => String(r.proposal_version_id) === String(versionId)),
      listRes.error?.message || `rows=${listRes.data?.length || 0}`
    );

    const leadRes = await authed.rpc('get_lead_proposals', {
      p_org_id: orgId,
      p_lead_id: Number(leadId),
    });
    report(
      'rpc get_lead_proposals',
      !leadRes.error && Array.isArray(leadRes.data) && leadRes.data.some((r) => String(r.proposal_version_id) === String(versionId)),
      leadRes.error?.message || `rows=${leadRes.data?.length || 0}`
    );
  } finally {
    if (versionId) await admin.from('proposal_versions').delete().eq('id', versionId);
    if (propostaId) await admin.from('propostas').delete().eq('id', propostaId);
    if (leadId) await admin.from('leads').delete().eq('id', leadId);
    if (userId && orgId) await admin.from('organization_members').delete().eq('org_id', orgId).eq('user_id', userId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }

  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error('FAIL: smoke crashed', error);
  process.exit(1);
});
