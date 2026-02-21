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

const INGEST_FN_URL = `${SUPABASE_URL}/functions/v1/kb-ingest`;

const rand = (n = 8) => Math.random().toString(16).slice(2, 2 + n);
const assert = (name, condition, details) => {
  const ok = Boolean(condition);
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${details ? ` -> ${details}` : ''}`);
  if (!ok) process.exitCode = 1;
  return ok;
};

async function main() {
  const email = `smoke.kb.ingest.${Date.now()}.${rand(6)}@example.com`;
  const password = `S!moke_${Date.now()}_${rand(10)}`;

  let userId = null;
  let accessToken = null;
  let kbItemId = null;
  const bucket = 'knowledge-base';
  let storagePath = null;

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

    const needle = `SMOKE_INGEST_NEEDLE_${Date.now()}_${rand(6)}`;
    const fileText = `Documento de teste para ingestao.\n\nNeedle=${needle}\n\nPolitica de garantia e processo.`;

    storagePath = `${userId}/smoke_ingest_${Date.now()}_${rand(4)}.txt`;

    const { error: uploadErr } = await anon.storage
      .from(bucket)
      .upload(storagePath, new Blob([fileText], { type: 'text/plain' }), { upsert: true });
    assert('upload storage txt', !uploadErr, uploadErr?.message);
    if (uploadErr) return;

    const { data: kb, error: kbErr } = await admin
      .from('kb_items')
      .insert({
        org_id: userId,
        type: 'process',
        title: `Doc Smoke (${needle})`,
        body: `[arquivo:smoke_ingest.txt] [storage_path:${storagePath}] ${fileText}`.trim(),
        tags: ['smoke', 'ingest'],
        status: 'approved',
        created_by: userId,
        storage_bucket: bucket,
        storage_path: storagePath,
        mime_type: 'text/plain',
      })
      .select('id')
      .single();
    assert('insert kb_items', !kbErr && kb?.id, kbErr?.message);
    kbItemId = kb?.id ?? null;
    if (!kbItemId) return;

    const ingestResp = await fetch(INGEST_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ kbItemId }),
    });
    const ingestBody = await ingestResp.json().catch(() => ({}));
    assert('kb-ingest HTTP 200', ingestResp.status === 200, `status=${ingestResp.status} body=${JSON.stringify(ingestBody).slice(0, 180)}`);
    if (ingestResp.status !== 200) return;

    const ingested = Array.isArray(ingestBody?.ingested) ? ingestBody.ingested : [];
    assert('kb-ingest reports ingested', ingested.some((r) => r?.id === kbItemId), `ingested=${ingested.length}`);

    const { data: chunks, error: chunksErr } = await admin
      .from('kb_item_chunks')
      .select('id, chunk_text')
      .eq('kb_item_id', kbItemId)
      .order('chunk_index', { ascending: true })
      .limit(50);
    assert('kb_item_chunks select', !chunksErr && Array.isArray(chunks) && chunks.length > 0, chunksErr?.message || `chunks=${chunks?.length || 0}`);
    const needleInChunks = Array.isArray(chunks) && chunks.some((c) => String(c?.chunk_text || '').includes(needle));
    assert('chunk contains needle', needleInChunks, `needle=${needle}`);

    const { data: rpc, error: rpcErr } = await admin.rpc('knowledge_search_v3', {
      p_org_id: userId,
      p_query_text: needle,
      p_limit: 6,
    });
    assert('knowledge_search_v3 callable', !rpcErr, rpcErr?.message);
    const foundChunk = Array.isArray(rpc) && rpc.some((row) => row?.item_type === 'kb_chunk' && String(row?.content_snippet || '').includes(needle));
    assert('knowledge_search_v3 returns kb_chunk with needle', foundChunk, `rows=${Array.isArray(rpc) ? rpc.length : 0}`);
  } finally {
    if (kbItemId) {
      await admin.from('kb_item_chunks').delete().eq('kb_item_id', kbItemId);
      await admin.from('kb_items').delete().eq('id', kbItemId);
    }
    if (storagePath) {
      await admin.storage.from(bucket).remove([storagePath]);
    }
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  }

  if (process.exitCode) process.exit(1);
}

main().catch((err) => {
  console.error('Smoke failed with exception:', err);
  process.exit(1);
});
