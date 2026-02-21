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

const FN_URL = `${SUPABASE_URL}/functions/v1/proposal-copy-generator`;

const assert = (name, condition, details) => {
  const ok = Boolean(condition);
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${details ? ` -> ${details}` : ''}`);
  if (!ok) process.exitCode = 1;
  return ok;
};

const rand = (n = 8) => Math.random().toString(16).slice(2, 2 + n);

async function main() {
  const email = `smoke.proposal.copy.${Date.now()}.${rand(6)}@example.com`;
  const password = `S!moke_${Date.now()}_${rand(10)}`;
  let userId = null;
  let leadId = null;

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
    assert('sign in with password', !signInErr && signIn?.session?.access_token, signInErr?.message);
    const accessToken = signIn?.session?.access_token;
    if (!accessToken) return;
    const signedInUserId = signIn?.user?.id || null;
    assert('signed-in user matches created user', signedInUserId === userId, `created=${userId} signed_in=${signedInUserId}`);

    // Decode JWT header/payload for debugging (no signature verification).
    try {
      const [h, p] = accessToken.split('.');
      const decode = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
      const header = decode(h);
      const payload = decode(p);
      console.log(
        'JWT claims:',
        JSON.stringify(
          {
            alg: header.alg,
            typ: header.typ,
            iss: payload.iss,
            aud: payload.aud,
            role: payload.role,
            exp_in_sec: payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : null,
          },
          null,
          2
        )
      );
    } catch (jwtDecodeErr) {
      console.log('JWT decode failed (non-blocking):', jwtDecodeErr?.message || jwtDecodeErr);
    }

    // Sanity check: can this token query PostgREST as authenticated?
    const { data: leadProbe, error: leadProbeErr } = await anon.from('leads').select('id').limit(1);
    assert(
      'authenticated PostgREST works (leads select)',
      !leadProbeErr,
      leadProbeErr ? leadProbeErr.message : `rows=${Array.isArray(leadProbe) ? leadProbe.length : 0}`
    );

    const phone = `55119999${Math.floor(1000 + Math.random() * 8999)}`;

    const { data: lead, error: leadErr } = await admin
      .from('leads')
      .insert({
        nome: 'SMOKE_PROPOSAL_COPY_LEAD',
        telefone: phone,
        user_id: userId,
        status_pipeline: 'respondeu',
        ai_enabled: true,
      })
      .select('id')
      .single();

    assert('create lead owned by user', !leadErr && lead?.id, leadErr?.message);
    leadId = lead?.id ?? null;
    if (!leadId) return;
    console.log('leadId debug:', leadId, 'type=', typeof leadId);

    const { data: leadCheck, error: leadCheckErr } = await admin
      .from('leads')
      .select('id, user_id')
      .eq('id', leadId)
      .maybeSingle();
    assert('lead.user_id persisted', !leadCheckErr && leadCheck?.user_id === userId, leadCheckErr?.message);

    const payload = {
      leadId,
      contactName: 'Cliente Smoke',
      clientType: 'residencial',
      city: 'São Paulo',
      state: 'SP',
      observacoes: 'Cliente pediu proposta com financiamento e quer retorno rápido.',
      metrics: {
        consumoMensal: 450,
        potenciaSistema: 4.2,
        quantidadePaineis: 8,
        valorTotal: 25000,
        economiaAnual: 5400,
        paybackMeses: 56,
        garantiaAnos: 25,
      },
      baseContent: {
        headline: 'Base headline',
        executiveSummary: 'Base summary',
        personaFocus: 'economia e tranquilidade',
        nextStepCta: 'Agendar apresentação da proposta',
        valuePillars: ['economia', 'payback', 'garantia'],
        proofPoints: ['500 projetos instalados', 'equipe própria'],
        objectionHandlers: ['Preço: financiamento'],
        assumptions: ['Validade 15 dias'],
      },
      context: {
        comments: [{ texto: 'Cliente quer financiamento', autor: 'vendedor', created_at: new Date().toISOString() }],
        interactions: [
          {
            created_at: new Date(Date.now() - 60_000).toISOString(),
            wa_from_me: false,
            tipo: 'mensagem_cliente',
            mensagem: 'Quero financiamento e payback rapido.',
          },
          {
            created_at: new Date().toISOString(),
            wa_from_me: true,
            tipo: 'mensagem_vendedor',
            mensagem: 'Perfeito, vou montar uma proposta com garantia e ROI.',
          },
        ],
        documents: [
          {
            title: 'Politica de Garantia',
            type: 'process',
            tags: ['garantia'],
            body_snippet: 'Garantia de 25 anos nos modulos e 10 anos no inversor.',
          },
        ],
        companyProfile: { elevator_pitch: 'Empresa X', differentials: 'Equipe própria' },
        objections: [{ question: 'É caro?', response: 'Parcela menor que conta', priority: 1 }],
        testimonials: [{ display_name: 'João', quote_short: 'Economizei muito', type: 'text' }],
      },
    };

    // Sanity check: does this user JWT pass edge gateway verification at all?
    // (reports-export is an existing function in this project; any non-401/Invalid JWT indicates the token is accepted.)
    const jwtSanityResp = await fetch(`${SUPABASE_URL}/functions/v1/reports-export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ smoke: true }),
    });
    const jwtSanityBody = await jwtSanityResp.json().catch(() => ({}));
    assert(
      'edge gateway accepts user JWT (reports-export)',
      jwtSanityResp.status !== 401 || jwtSanityBody?.message !== 'Invalid JWT',
      `status=${jwtSanityResp.status} body=${JSON.stringify(jwtSanityBody).slice(0, 120)}`
    );

    const resp = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const body = await resp.json().catch(() => ({}));
    assert('proposal-copy-generator HTTP 200', resp.status === 200, `status=${resp.status} body=${JSON.stringify(body).slice(0, 160)}`);
    if (resp.status !== 200) return;

    const variants = Array.isArray(body?.variants) ? body.variants : [];
    assert('returns 2 variants', variants.length === 2, `len=${variants.length}`);
    const hasFields = variants.every((v) =>
      v &&
      (v.id === 'a' || v.id === 'b') &&
      typeof v.headline === 'string' &&
      typeof v.executive_summary === 'string' &&
      typeof v.next_step_cta === 'string' &&
      Array.isArray(v.value_pillars) &&
      typeof v.persuasion_score === 'number'
    );
    assert('variant schema looks ok', hasFields, JSON.stringify(variants[0] || {}).slice(0, 180));
  } finally {
    if (leadId) {
      await admin.from('leads').delete().eq('id', leadId);
    }
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
}

main().catch((err) => {
  console.error('Smoke failed with exception:', err);
  process.exit(1);
});
