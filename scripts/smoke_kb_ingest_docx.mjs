import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
const bucket = 'knowledge-base';

const rand = (n = 8) => Math.random().toString(16).slice(2, 2 + n);
const assert = (name, condition, details) => {
  const ok = Boolean(condition);
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${details ? ` -> ${details}` : ''}`);
  if (!ok) process.exitCode = 1;
  return ok;
};

function makeMinimalDocx(tempDir, text) {
  const relsDir = path.join(tempDir, '_rels');
  const wordDir = path.join(tempDir, 'word');
  fs.mkdirSync(relsDir, { recursive: true });
  fs.mkdirSync(wordDir, { recursive: true });

  fs.writeFileSync(
    path.join(tempDir, '[Content_Types].xml'),
    `<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n` +
      `<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">` +
      `<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>` +
      `<Default Extension=\"xml\" ContentType=\"application/xml\"/>` +
      `<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>` +
      `</Types>\n`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(relsDir, '.rels'),
    `<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n` +
      `<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">` +
      `<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>` +
      `</Relationships>\n`,
    'utf8'
  );

  const escaped = String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

  fs.writeFileSync(
    path.join(wordDir, 'document.xml'),
    `<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n` +
      `<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">` +
      `<w:body>` +
      `<w:p><w:r><w:t>${escaped}</w:t></w:r></w:p>` +
      `</w:body>` +
      `</w:document>\n`,
    'utf8'
  );
}

async function main() {
  const email = `smoke.kb.ingest.docx.${Date.now()}.${rand(6)}@example.com`;
  const password = `S!moke_${Date.now()}_${rand(10)}`;

  let userId = null;
  let accessToken = null;
  let kbItemId = null;
  let storagePath = null;

  const needle = `SMOKE_DOCX_NEEDLE_${Date.now()}_${rand(6)}`;
  const docText = `Documento de teste DOCX. Needle=${needle}. Politica de garantia e financiamento.`;

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-docx-'));
  const pkgDir = path.join(tmpRoot, 'pkg');
  fs.mkdirSync(pkgDir, { recursive: true });
  makeMinimalDocx(pkgDir, docText);

  const localZip = path.join(tmpRoot, 'smoke.zip');
  const localDocx = path.join(tmpRoot, 'smoke.docx');

  try {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path \"${pkgDir}\\*\" -DestinationPath \"${localZip}\" -Force`,
      ],
      { stdio: 'pipe' }
    );
  } catch (err) {
    console.error('Compress-Archive failed:', err?.message || err);
    if (err?.stdout) console.error('stdout:', String(err.stdout));
    if (err?.stderr) console.error('stderr:', String(err.stderr));
    process.exit(1);
  }

  fs.renameSync(localZip, localDocx);

  const docxBytes = fs.readFileSync(localDocx);

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

    storagePath = `${userId}/smoke_ingest_${Date.now()}_${rand(4)}.docx`;

    const { error: uploadErr } = await anon.storage
      .from(bucket)
      .upload(storagePath, new Blob([docxBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), { upsert: true });
    assert('upload storage docx', !uploadErr, uploadErr?.message);
    if (uploadErr) return;

    const { data: kb, error: kbErr } = await admin
      .from('kb_items')
      .insert({
        org_id: userId,
        type: 'process',
        title: `Doc DOCX Smoke (${needle})`,
        body: `[arquivo:smoke.docx] [storage_path:${storagePath}] Documento DOCX importado. Needle=${needle}`.trim(),
        tags: ['smoke', 'ingest', 'docx'],
        status: 'approved',
        created_by: userId,
        storage_bucket: bucket,
        storage_path: storagePath,
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
    assert(
      'kb-ingest HTTP 200',
      ingestResp.status === 200,
      `status=${ingestResp.status} body=${JSON.stringify(ingestBody).slice(0, 200)}`
    );
    if (ingestResp.status !== 200) return;

    const ingested = Array.isArray(ingestBody?.ingested) ? ingestBody.ingested : [];
    const failed = Array.isArray(ingestBody?.failed) ? ingestBody.failed : [];
    assert('kb-ingest reports ingested', ingested.some((r) => r?.id === kbItemId), JSON.stringify({ ingested: ingested.length, failed: failed.length }));

    const { data: chunks, error: chunksErr } = await admin
      .from('kb_item_chunks')
      .select('id, chunk_text')
      .eq('kb_item_id', kbItemId)
      .limit(20);
    assert('kb_item_chunks created for docx', !chunksErr && Array.isArray(chunks) && chunks.length > 0, chunksErr?.message || `chunks=${chunks?.length || 0}`);
    const needleInChunks = Array.isArray(chunks) && chunks.some((c) => String(c?.chunk_text || '').includes(needle));
    assert('docx chunk contains needle', needleInChunks, `needle=${needle}`);
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
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
