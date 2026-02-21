import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env vars: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY), SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const FN_URL = `${SUPABASE_URL}/functions/v1/proposal-context-engine`;
const rand = (n = 8) => Math.random().toString(16).slice(2, 2 + n);

const assert = (name, condition, details) => {
  const ok = Boolean(condition);
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${details ? ` -> ${details}` : ''}`);
  if (!ok) process.exitCode = 1;
  return ok;
};

async function main() {
  const email = `smoke.proposal.ctx.${Date.now()}.${rand(6)}@example.com`;
  const password = `S!moke_${Date.now()}_${rand(10)}`;

  let userId = null;
  let accessToken = null;
  let leadId = null;
  let kbId = null;
  let companyOrgId = null;
  let objectionId = null;
  let testimonialId = null;

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
    accessToken = signIn?.session?.access_token || null;
    if (!accessToken) return;

    const phone = `55119999${Math.floor(1000 + Math.random() * 8999)}`;

    const { data: lead, error: leadErr } = await admin
      .from('leads')
      .insert({
        nome: 'SMOKE_CTX_LEAD',
        telefone: phone,
        user_id: userId,
        ai_enabled: true,
        status_pipeline: 'respondeu',
      })
      .select('id')
      .single();
    assert('create lead (owned by user)', !leadErr && lead?.id, leadErr?.message);
    leadId = lead?.id ?? null;
    if (!leadId) return;

    const remoteJid = `${phone}@s.whatsapp.net`;

    const { error: inter1Err } = await admin.from('interacoes').insert({
      lead_id: leadId,
      mensagem: 'Oi, quero uma proposta e estou avaliando financiamento.',
      tipo: 'mensagem_cliente',
      instance_name: 'smoke_ctx',
      remote_jid: remoteJid,
      wa_from_me: false,
    });
    assert('insert interaction 1', !inter1Err, inter1Err?.message);

    const { error: inter2Err } = await admin.from('interacoes').insert({
      lead_id: leadId,
      mensagem: 'Perfeito. Vou montar uma proposta com payback e garantia.',
      tipo: 'mensagem_vendedor',
      instance_name: 'smoke_ctx',
      remote_jid: remoteJid,
      wa_from_me: true,
    });
    assert('insert interaction 2', !inter2Err, inter2Err?.message);

    const commentNeedle = `SMOKE_CTX_COMMENT_${Date.now()}_${rand(6)}`;
    const { error: commentErr } = await admin.from('comentarios_leads').insert({
      lead_id: leadId,
      texto: `Cliente pediu financiamento e retorno rapido. ${commentNeedle}`,
      autor: 'smoke',
    });
    assert('insert comentario_leads', !commentErr, commentErr?.message);

    companyOrgId = userId;
    const { error: companyErr } = await admin.from('company_profile').insert({
      org_id: companyOrgId,
      elevator_pitch: 'Instaladora premium com equipe propria.',
      differentials: 'Projeto + homologacao + instalacao com garantia.',
      installation_process: 'Vistoria, projeto, homologacao, instalacao, pos-venda.',
      warranty_info: 'Garantia de 25 anos nos modulos e 10 anos no inversor.',
      payment_options: 'A vista, cartao, financiamento.',
    });
    assert('insert company_profile', !companyErr, companyErr?.message);

    const { data: objection, error: objectionErr } = await admin
      .from('objection_responses')
      .insert({
        org_id: userId,
        question: 'E se quebrar?',
        response: 'Temos suporte e garantias contratuais, com equipe propria.',
        priority: 1,
      })
      .select('id')
      .single();
    assert('insert objection_responses', !objectionErr && objection?.id, objectionErr?.message);
    objectionId = objection?.id ?? null;

    const { data: testimonial, error: testimonialErr } = await admin
      .from('testimonials')
      .insert({
        org_id: userId,
        display_name: 'Cliente Smoke',
        quote_short: 'Economizei de verdade e a instalacao foi impecavel.',
        type: 'text',
        status: 'approved',
        consent_status: 'public',
        created_by: userId,
      })
      .select('id')
      .single();
    assert('insert testimonial', !testimonialErr && testimonial?.id, testimonialErr?.message);
    testimonialId = testimonial?.id ?? null;

    const docNeedle = `SMOKE_CTX_DOC_${Date.now()}_${rand(6)}`;
    const { data: kb, error: kbErr } = await admin
      .from('kb_items')
      .insert({
        org_id: userId,
        type: 'process',
        title: `Politica de Garantia (${docNeedle})`,
        body: `Documento interno: garantias, prazos e fluxo de instalacao. Needle=${docNeedle}`,
        tags: ['smoke', 'garantia', 'processo'],
        status: 'approved',
        created_by: userId,
      })
      .select('id')
      .single();
    assert('insert kb_items', !kbErr && kb?.id, kbErr?.message);
    kbId = kb?.id ?? null;

    // Ensure the RAG query includes the doc needle, so documentsRelevant can match.
    const { error: comment2Err } = await admin.from('comentarios_leads').insert({
      lead_id: leadId,
      texto: `Use a politica de garantia do documento ${docNeedle} na proposta.`,
      autor: 'smoke',
    });
    assert('insert comentario_leads 2', !comment2Err, comment2Err?.message);

    const resp = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ leadId: Number(leadId), debug: true }),
    });

    const out = await resp.json().catch(() => ({}));
    assert('proposal-context-engine HTTP 200', resp.status === 200, `status=${resp.status} body=${JSON.stringify(out).slice(0, 160)}`);
    if (resp.status !== 200) return;

    assert('returns lead.id', out?.lead?.id === leadId, `lead.id=${out?.lead?.id}`);
    assert('returns comments', Array.isArray(out?.comments) && out.comments.some((c) => String(c?.texto || '').includes(commentNeedle)), `comments=${Array.isArray(out?.comments) ? out.comments.length : 0}`);
    assert('returns interactions', Array.isArray(out?.interactions) && out.interactions.length >= 2, `interactions=${Array.isArray(out?.interactions) ? out.interactions.length : 0}`);
    assert('returns companyProfile', !!out?.companyProfile?.elevator_pitch, JSON.stringify(out?.companyProfile || {}).slice(0, 120));
    assert('returns objections', Array.isArray(out?.objections) && out.objections.length >= 1, `objections=${Array.isArray(out?.objections) ? out.objections.length : 0}`);
    assert('returns testimonials', Array.isArray(out?.testimonials) && out.testimonials.length >= 1, `testimonials=${Array.isArray(out?.testimonials) ? out.testimonials.length : 0}`);
    assert('returns documents', Array.isArray(out?.documents) && out.documents.some((d) => String(d?.title || '').includes(docNeedle)), `documents=${Array.isArray(out?.documents) ? out.documents.length : 0}`);
    assert('returns documentsRelevant', Array.isArray(out?.documentsRelevant), `documentsRelevant=${Array.isArray(out?.documentsRelevant) ? out.documentsRelevant.length : 0}`);
    assert(
      'documentsRelevant matches needle',
      Array.isArray(out?.documentsRelevant) && out.documentsRelevant.some((d) => String(d?.title || '').includes(docNeedle)),
      `documentsRelevant=${Array.isArray(out?.documentsRelevant) ? out.documentsRelevant.length : 0}`
    );
    assert('ragDebug included', typeof out?.ragDebug === 'object' && out.ragDebug !== null, JSON.stringify(out?.ragDebug || {}).slice(0, 160));
    assert('ragDebug has no error', !out?.ragDebug?.rag_error, `rag_error=${out?.ragDebug?.rag_error || ''}`);
  } finally {
    // Best-effort cleanup.
    if (leadId) {
      await admin.from('comentarios_leads').delete().eq('lead_id', leadId);
      await admin.from('interacoes').delete().eq('lead_id', leadId).eq('instance_name', 'smoke_ctx');
      await admin.from('leads').delete().eq('id', leadId);
    }
    if (kbId) await admin.from('kb_items').delete().eq('id', kbId);
    if (testimonialId) await admin.from('testimonials').delete().eq('id', testimonialId);
    if (objectionId) await admin.from('objection_responses').delete().eq('id', objectionId);
    if (companyOrgId) await admin.from('company_profile').delete().eq('org_id', companyOrgId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }

  if (process.exitCode) process.exit(1);
}

main().catch((err) => {
  console.error('Smoke failed with exception:', err);
  process.exit(1);
});
