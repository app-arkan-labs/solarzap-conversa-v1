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
  const startedAtIso = new Date().toISOString();
  let lead = null;
  let originalStage = null;

  try {
    const { data, error } = await admin
      .from('leads')
      .select('id, org_id, status_pipeline')
      .not('org_id', 'is', null)
      .limit(1)
      .maybeSingle();

    report('find lead', !error && !!data?.id, error?.message || '');
    if (!data?.id) return;

    lead = data;
    originalStage = String(data.status_pipeline || 'respondeu');

    const { error: updateError } = await admin
      .from('leads')
      .update({ status_pipeline: 'financiamento', stage_changed_at: new Date().toISOString() })
      .eq('id', lead.id)
      .eq('org_id', lead.org_id);

    report('update lead to financiamento', !updateError, updateError?.message || 'ok');
    if (updateError) return;

    await sleep(1500);

    const { data: events, error: eventError } = await admin
      .from('notification_events')
      .select('id, event_type, payload, created_at')
      .eq('org_id', lead.org_id)
      .eq('event_type', 'financiamento_update')
      .eq('entity_type', 'lead')
      .eq('entity_id', String(lead.id))
      .gte('created_at', startedAtIso)
      .order('created_at', { ascending: false })
      .limit(5);

    if (eventError) {
      report('financiamento_update enqueued', false, eventError.message);
      return;
    }

    const latest = (events || [])[0];
    report('financiamento_update enqueued', !!latest?.id, latest?.id ? `event_id=${latest.id}` : 'no event found');
  } finally {
    if (lead?.id && lead?.org_id && originalStage) {
      await admin
        .from('leads')
        .update({ status_pipeline: originalStage, stage_changed_at: new Date().toISOString() })
        .eq('id', lead.id)
        .eq('org_id', lead.org_id);
    }
  }

  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error('FAIL: smoke crashed', error);
  process.exit(1);
});
