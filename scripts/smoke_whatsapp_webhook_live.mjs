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

const env = loadEnv();
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = process.env.ARKAN_WEBHOOK_SECRET || env.ARKAN_WEBHOOK_SECRET || 'solar_secret_2026';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('FAIL: missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  let insertedInteractionId = null;
  let generatedPhoneE164 = null;
  let instanceName = null;
  let orgId = null;
  const msgId = `smoke_webhook_${Date.now()}`;

  try {
    const { data: instance, error: instanceErr } = await admin
      .from('whatsapp_instances')
      .select('instance_name, org_id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    report('find whatsapp instance', !instanceErr && !!instance?.instance_name, instanceErr?.message || '');
    if (!instance?.instance_name) return;
    instanceName = instance.instance_name;
    orgId = instance.org_id;

    generatedPhoneE164 = `5511${Math.floor(10000000 + Math.random() * 89999999)}`;
    const remoteJid = `${generatedPhoneE164}@s.whatsapp.net`;

    const payload = {
      event: 'MESSAGES_UPSERT',
      instance: instanceName,
      data: {
        key: {
          remoteJid,
          fromMe: false,
          id: msgId,
        },
        messageType: 'conversation',
        message: {
          conversation: `SMOKE WEBHOOK ${msgId}`,
        },
        pushName: 'SMOKE_WEBHOOK',
      },
    };

    const webhookUrl = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/whatsapp-webhook?secret=${encodeURIComponent(WEBHOOK_SECRET)}`;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await response.text();
    report('post whatsapp-webhook', response.ok, `status=${response.status} body=${body.slice(0, 120)}`);
    if (!response.ok) return;

    await sleep(3000);

    const { data: events, error: eventsErr } = await admin
      .from('whatsapp_webhook_events')
      .select('id, event, instance_name, payload')
      .eq('instance_name', instanceName)
      .eq('event', 'MESSAGES_UPSERT')
      .order('id', { ascending: false })
      .limit(20);

    if (eventsErr) {
      report('webhook event persisted', false, eventsErr.message);
    } else {
      const matched = (events || []).some((e) => {
        const keyId = e?.payload?.data?.key?.id || e?.payload?.key?.id || null;
        return keyId === msgId;
      });
      report('webhook event persisted', matched, `rows_checked=${events?.length || 0}`);
    }

    const { data: interactions, error: interactionsErr } = await admin
      .from('interacoes')
      .select('id, lead_id, wa_message_id, created_at')
      .eq('instance_name', instanceName)
      .eq('wa_message_id', msgId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (interactionsErr) {
      report('interaction persisted', false, interactionsErr.message);
    } else {
      const row = interactions?.[0];
      insertedInteractionId = row?.id || null;
      report('interaction persisted', !!row?.id, row?.id ? `interaction_id=${row.id}` : 'not found');
    }
  } finally {
    if (insertedInteractionId) {
      await admin.from('interacoes').delete().eq('id', insertedInteractionId);
    }
    if (generatedPhoneE164 && orgId) {
      await admin.from('leads').delete().eq('org_id', orgId).eq('phone_e164', generatedPhoneE164);
    }
  }

  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error('FAIL: smoke crashed', error);
  process.exit(1);
});
