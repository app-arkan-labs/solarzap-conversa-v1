import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing env vars: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY), SUPABASE_SERVICE_ROLE_KEY are required.'
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CTX_FN_URL = `${SUPABASE_URL}/functions/v1/proposal-context-engine`;
const COMPOSER_FN_URL = `${SUPABASE_URL}/functions/v1/proposal-composer`;

const rand = (n = 8) => Math.random().toString(16).slice(2, 2 + n);
const assert = (name, condition, details) => {
  const ok = Boolean(condition);
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${details ? ` -> ${details}` : ''}`);
  if (!ok) process.exitCode = 1;
  return ok;
};

async function main() {
  const email = `smoke.proposal.composer.${Date.now()}.${rand(6)}@example.com`;
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
        nome: 'SMOKE_COMPOSER_LEAD',
        telefone: phone,
        user_id: userId,
        ai_enabled: true,
        status_pipeline: 'respondeu',
        consumo_kwh: 420,
        valor_estimado: 28000,
      })
      .select('id')
      .single();
    assert('create lead (owned by user)', !leadErr && lead?.id, leadErr?.message);
    leadId = lead?.id ?? null;
    if (!leadId) return;

    const remoteJid = `${phone}@s.whatsapp.net`;

    const { error: inter1Err } = await admin.from('interacoes').insert({
      lead_id: leadId,
      mensagem: 'Oi, quero uma proposta bem detalhada e estou comparando com financiamento.',
      tipo: 'mensagem_cliente',
      instance_name: 'smoke_composer',
      remote_jid: remoteJid,
      wa_from_me: false,
    });
    assert('insert interaction 1', !inter1Err, inter1Err?.message);

    const { error: inter2Err } = await admin.from('interacoes').insert({
      lead_id: leadId,
      mensagem: 'Perfeito. Vou incluir payback, garantias e próximos passos.',
      tipo: 'mensagem_vendedor',
      instance_name: 'smoke_composer',
      remote_jid: remoteJid,
      wa_from_me: true,
    });
    assert('insert interaction 2', !inter2Err, inter2Err?.message);

    const commentNeedle = `SMOKE_COMPOSER_COMMENT_${Date.now()}_${rand(6)}`;
    const { error: commentErr } = await admin.from('comentarios_leads').insert({
      lead_id: leadId,
      texto: `Cliente tem urgencia e quer financiamento. ${commentNeedle}`,
      autor: 'smoke',
    });
    assert('insert comentario_leads', !commentErr, commentErr?.message);

    companyOrgId = userId;
    const { error: companyErr } = await admin.from('company_profile').insert({
      org_id: companyOrgId,
      elevator_pitch: 'Instaladora premium com equipe própria e pós-venda rápido.',
      differentials: 'Projeto executivo + homologação + instalação + monitoramento.',
      installation_process: 'Vistoria, projeto, homologação, instalação, comissionamento e pós-venda.',
      warranty_info: 'Garantia de 25 anos nos módulos e 10 anos no inversor (conforme fabricante).',
      payment_options: 'À vista, cartão, financiamento em até 60x.',
    });
    assert('insert company_profile', !companyErr, companyErr?.message);

    const { data: objection, error: objectionErr } = await admin
      .from('objection_responses')
      .insert({
        org_id: userId,
        question: 'E se eu mudar de casa?',
        response: 'O sistema agrega valor ao imóvel e pode ser removido e reinstalado com análise técnica.',
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
        quote_short: 'Economia real e atendimento excelente. Assinei tranquilo.',
        type: 'text',
        status: 'approved',
        consent_status: 'public',
        created_by: userId,
      })
      .select('id')
      .single();
    assert('insert testimonial', !testimonialErr && testimonial?.id, testimonialErr?.message);
    testimonialId = testimonial?.id ?? null;

    const docNeedle = `SMOKE_COMPOSER_DOC_${Date.now()}_${rand(6)}`;
    const { data: kb, error: kbErr } = await admin
      .from('kb_items')
      .insert({
        org_id: userId,
        type: 'process',
        title: `Garantias e Processo (${docNeedle})`,
        body: `Política interna de garantia e etapas do projeto. Needle=${docNeedle}`,
        tags: ['smoke', 'garantia', 'processo'],
        status: 'approved',
        created_by: userId,
      })
      .select('id')
      .single();
    assert('insert kb_items', !kbErr && kb?.id, kbErr?.message);
    kbId = kb?.id ?? null;

    const ctxResp = await fetch(CTX_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ leadId: Number(leadId), debug: true }),
    });
    const ctxOut = await ctxResp.json().catch(() => ({}));
    assert('proposal-context-engine HTTP 200', ctxResp.status === 200, `status=${ctxResp.status}`);
    if (ctxResp.status !== 200) return;

    const composerResp = await fetch(COMPOSER_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        leadId: Number(leadId),
        contactName: 'SMOKE_COMPOSER_LEAD',
        clientType: 'residencial',
        city: 'São Paulo',
        state: 'SP',
        observacoes: 'Cliente pediu proposta premium e quer comparar financiamento.',
        metrics: {
          consumoMensal: 420,
          potenciaSistema: 6.0,
          quantidadePaineis: 11,
          valorTotal: 28000,
          economiaAnual: 9500,
          paybackMeses: 36,
          garantiaAnos: 25,
        },
        context: {
          comments: ctxOut?.comments || [],
          companyProfile: ctxOut?.companyProfile || null,
          objections: ctxOut?.objections || [],
          testimonials: ctxOut?.testimonials || [],
          interactions: ctxOut?.interactions || [],
          documents: ctxOut?.documentsRelevant?.length ? ctxOut.documentsRelevant : ctxOut?.documents || [],
        },
      }),
    });
    const composerOut = await composerResp.json().catch(() => ({}));
    assert('proposal-composer HTTP 200', composerResp.status === 200, `status=${composerResp.status} body=${JSON.stringify(composerOut).slice(0, 120)}`);
    if (composerResp.status !== 200) return;

    const variants = Array.isArray(composerOut?.variants) ? composerOut.variants : [];
    assert('returns 2 variants', variants.length === 2, `len=${variants.length}`);

    const requiredSectionKeys = [
      'first_fold',
      'roi_payback',
      'proof_points',
      'warranty_and_risk',
      'financing',
      'objections',
      'next_steps',
      'assumptions',
    ];

    for (const v of variants) {
      const vid = String(v?.id || '?');
      const sections = Array.isArray(v?.sections) ? v.sections : [];
      assert(`variant ${vid} has sections`, sections.length > 0, `sections=${sections.length}`);
      const keys = new Set(
        sections
          .map((s) => String(s?.section_key || s?.key || '').toLowerCase().trim())
          .filter(Boolean)
      );
      for (const k of requiredSectionKeys) {
        assert(`variant ${vid} includes section ${k}`, keys.has(k), `keys=${Array.from(keys).slice(0, 8).join(',')}`);
      }
    }
  } finally {
    // Best-effort cleanup.
    if (leadId) {
      await admin.from('comentarios_leads').delete().eq('lead_id', leadId);
      await admin.from('interacoes').delete().eq('lead_id', leadId).eq('instance_name', 'smoke_composer');
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

