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
const USER_EMAIL = process.env.SMOKE_USER_EMAIL || '';
const USER_PASSWORD = process.env.SMOKE_USER_PASSWORD || '';

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('FAIL: missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}
if (!USER_EMAIL || !USER_PASSWORD) {
  console.error('FAIL: missing SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, ANON_KEY);

let failed = false;
function report(name, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  const suffix = detail ? ` -> ${detail}` : '';
  console.log(`${status}: ${name}${suffix}`);
  if (!ok) failed = true;
}

async function fetchOrgId(userId) {
  const { data, error } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.org_id || null;
}

async function fetchRow(orgId) {
  const { data, error } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('org_id', orgId)
    .single();
  if (error) throw error;
  return data;
}

async function updateAndCheck(orgId, patch, key, expected) {
  const { data, error } = await supabase
    .from('notification_settings')
    .upsert({ org_id: orgId, ...patch }, { onConflict: 'org_id' })
    .select('*')
    .single();

  if (error) throw error;

  const actual = data?.[key];
  const ok = Array.isArray(expected)
    ? JSON.stringify(actual || []) === JSON.stringify(expected)
    : actual === expected;
  report(`persist ${key}`, ok, `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

async function main() {
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: USER_EMAIL,
    password: USER_PASSWORD,
  });
  report('sign in smoke user', !loginError && !!loginData?.user?.id, loginError?.message || '');
  if (!loginData?.user?.id) return;

  const userId = loginData.user.id;
  const orgId = await fetchOrgId(userId);
  report('resolve org', !!orgId, orgId || 'no org');
  if (!orgId) return;

  const original = await fetchRow(orgId);
  report('load notification_settings', !!original, '');
  if (!original) return;

  try {
    await updateAndCheck(orgId, { enabled_notifications: !original.enabled_notifications }, 'enabled_notifications', !original.enabled_notifications);
    await updateAndCheck(orgId, { enabled_whatsapp: !original.enabled_whatsapp }, 'enabled_whatsapp', !original.enabled_whatsapp);
    await updateAndCheck(orgId, { enabled_email: !original.enabled_email }, 'enabled_email', !original.enabled_email);
    await updateAndCheck(orgId, { enabled_reminders: !original.enabled_reminders }, 'enabled_reminders', !original.enabled_reminders);
    await updateAndCheck(orgId, { daily_digest_enabled: !original.daily_digest_enabled }, 'daily_digest_enabled', !original.daily_digest_enabled);
    await updateAndCheck(orgId, { weekly_digest_enabled: !original.weekly_digest_enabled }, 'weekly_digest_enabled', !original.weekly_digest_enabled);
    await updateAndCheck(orgId, { daily_digest_time: '20:15:00' }, 'daily_digest_time', '20:15:00');
    await updateAndCheck(orgId, { weekly_digest_time: '17:45:00' }, 'weekly_digest_time', '17:45:00');
    await updateAndCheck(orgId, { timezone: 'America/Sao_Paulo' }, 'timezone', 'America/Sao_Paulo');
    await updateAndCheck(orgId, { email_recipients: ['smoke-notify@example.com'] }, 'email_recipients', ['smoke-notify@example.com']);
  } finally {
    const restorePayload = {
      org_id: orgId,
      enabled_notifications: original.enabled_notifications,
      enabled_whatsapp: original.enabled_whatsapp,
      enabled_email: original.enabled_email,
      enabled_reminders: original.enabled_reminders,
      whatsapp_instance_name: original.whatsapp_instance_name,
      email_recipients: original.email_recipients || [],
      daily_digest_enabled: original.daily_digest_enabled,
      weekly_digest_enabled: original.weekly_digest_enabled,
      daily_digest_time: original.daily_digest_time,
      weekly_digest_time: original.weekly_digest_time,
      timezone: original.timezone,
      updated_by: original.updated_by || userId,
    };

    const { error: restoreError } = await supabase
      .from('notification_settings')
      .upsert(restorePayload, { onConflict: 'org_id' });

    report('restore original notification settings', !restoreError, restoreError?.message || '');
  }

  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error('FAIL: smoke crashed', error);
  process.exit(1);
});
