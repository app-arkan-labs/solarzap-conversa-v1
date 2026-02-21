import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const AI_AGENT_URL = `${SUPABASE_URL}/functions/v1/ai-pipeline-agent`;

const results = [];
const nowIso = () => new Date().toISOString();

const assert = (name, condition, details) => {
  const ok = Boolean(condition);
  results.push({ name, ok, details: details || null });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${details ? ` -> ${details}` : ''}`);
  if (!ok) process.exitCode = 1;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pickExistingUserId = async () => {
  // Prefer profiles if present; fallback to leads.
  try {
    const { data: profile, error } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
    if (!error && profile?.id) return profile.id;
  } catch {}

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('user_id')
    .not('user_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (leadErr) throw new Error(`Could not select leads.user_id: ${leadErr.message}`);
  if (!lead?.user_id) throw new Error('No user_id found in leads table.');
  return lead.user_id;
};

const pickAiEnabledInstanceName = async () => {
  const { data: inst, error } = await supabase
    .from('whatsapp_instances')
    .select('instance_name, ai_enabled')
    .eq('ai_enabled', true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not query whatsapp_instances: ${error.message}`);
  return inst?.instance_name || null;
};

const cleanupLead = async (leadId) => {
  // Best-effort cleanup. Order avoids FK violations.
  await supabase.from('proposal_delivery_events').delete().eq('lead_id', leadId);
  await supabase.from('proposal_versions').delete().eq('lead_id', leadId);
  await supabase.from('propostas').delete().eq('lead_id', leadId);
  await supabase.from('comentarios_leads').delete().eq('lead_id', leadId);
  await supabase.from('interacoes').delete().eq('lead_id', leadId);
  await supabase.from('leads').delete().eq('id', leadId);
};

async function testKnowledgeSearchIncludesKbItems() {
  const orgId = crypto.randomUUID();
  const uniqueNeedle = `SMOKE_KB_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const { data: inserted, error: insErr } = await supabase
    .from('kb_items')
    .insert({
      org_id: orgId,
      type: 'process',
      title: 'SMOKE KB ITEM',
      body: `Documento de teste. Needle=${uniqueNeedle}`,
      tags: ['smoke'],
      status: 'approved',
    })
    .select('id')
    .single();

  assert('kb_items insert', !insErr && inserted?.id, insErr?.message);

  const { data: rpc, error: rpcErr } = await supabase.rpc('knowledge_search_v2', {
    p_org_id: orgId,
    p_query_text: uniqueNeedle,
    p_limit: 5,
  });

  assert('knowledge_search_v2 callable', !rpcErr, rpcErr?.message);
  const foundKb = Array.isArray(rpc) && rpc.some((row) => row?.item_type === 'kb_item');
  assert('knowledge_search_v2 returns kb_item', foundKb, `rows=${Array.isArray(rpc) ? rpc.length : 0}`);

  if (inserted?.id) {
    await supabase.from('kb_items').delete().eq('id', inserted.id);
  }
}

async function testAiAgentCreatesProposalDraftAndPremiumSnapshot() {
  const instanceName = await pickAiEnabledInstanceName();
  if (!instanceName) {
    assert('ai-pipeline-agent proposal draft smoke', true, 'SKIPPED: no whatsapp_instances with ai_enabled=true');
    return;
  }

  const userId = await pickExistingUserId();
  const testPhone = `55119999${Math.floor(1000 + Math.random() * 8999)}`;

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .insert({
      nome: `SMOKE_PROPOSAL_PREMIUM_TEST_${Date.now()}`,
      telefone: testPhone,
      user_id: userId,
      ai_enabled: true,
      status_pipeline: 'respondeu',
      stage_changed_at: nowIso(),
    })
    .select('id, user_id')
    .single();

  assert('create test lead', !leadErr && lead?.id, leadErr?.message);
  if (!lead?.id) return;

  try {
    const remoteJid = `${testPhone}@s.whatsapp.net`;

    const { data: inbound, error: inboundErr } = await supabase
      .from('interacoes')
      .insert({
        lead_id: lead.id,
        mensagem: 'PROPOSAL_TEST_A',
        tipo: 'mensagem_cliente',
        instance_name: instanceName,
        remote_jid: remoteJid,
        wa_from_me: false,
      })
      .select('id')
      .single();

    assert('insert interacoes (client msg)', !inboundErr && inbound?.id, inboundErr?.message);
    if (!inbound?.id) return;

    const resp = await fetch(AI_AGENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        leadId: lead.id,
        interactionId: inbound.id,
        instanceName,
        remoteJid,
        dry_run: true,
        source: 'smoke',
      }),
    });

    const body = await resp.json().catch(() => ({}));
    assert('ai-pipeline-agent HTTP 200', resp.status === 200, `status=${resp.status} body=${JSON.stringify(body).slice(0, 140)}`);

    // Give a tiny buffer for DB side-effects after response
    await sleep(1500);

    const { data: proposta, error: propErr } = await supabase
      .from('propostas')
      .select('id, status, valor_projeto, consumo_kwh')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    assert('propostas draft created', !propErr && proposta?.status === 'Rascunho', propErr?.message || `status=${proposta?.status}`);
    assert('propostas draft values match', proposta?.valor_projeto === 25000 && proposta?.consumo_kwh === 350,
      `valor=${proposta?.valor_projeto} consumo=${proposta?.consumo_kwh}`);

    if (!proposta?.id) return;

    const { data: versionRows, error: verErr } = await supabase
      .from('proposal_versions')
      .select('id, proposta_id, version_no, status, source, segment')
      .eq('proposta_id', proposta.id)
      .order('version_no', { ascending: false })
      .limit(1);

    assert('proposal_versions snapshot inserted', !verErr && Array.isArray(versionRows) && versionRows.length >= 1, verErr?.message);

    const versionId = versionRows?.[0]?.id;
    if (versionId) {
      const { data: events, error: evErr } = await supabase
        .from('proposal_delivery_events')
        .select('id, event_type, channel')
        .eq('proposal_version_id', versionId)
        .limit(5);

      assert('proposal_delivery_events inserted', !evErr && Array.isArray(events) && events.some((e) => e.event_type === 'generated'),
        evErr?.message || `events=${Array.isArray(events) ? events.length : 0}`);
    } else {
      assert('proposal_delivery_events inserted', false, 'Missing versionId');
    }
  } finally {
    await cleanupLead(lead.id);
  }
}

async function main() {
  console.log('Running smoke_proposal_premium_min...');
  await testKnowledgeSearchIncludesKbItems();
  await testAiAgentCreatesProposalDraftAndPremiumSnapshot();

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;
  console.log(`\nDone. Passed=${okCount} Failed=${failCount}`);

  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Smoke failed with exception:', err);
  process.exit(1);
});
