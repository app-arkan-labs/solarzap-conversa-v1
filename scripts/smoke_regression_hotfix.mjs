import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = value;
  }
  return out;
}

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

const envFile = loadEnvFromFile('.env');
const SUPABASE_URL = env('SUPABASE_URL', env('VITE_SUPABASE_URL', envFile.SUPABASE_URL || envFile.VITE_SUPABASE_URL || ''));
const SUPABASE_ANON_KEY = env('SUPABASE_ANON_KEY', env('VITE_SUPABASE_ANON_KEY', envFile.SUPABASE_ANON_KEY || envFile.VITE_SUPABASE_ANON_KEY || ''));
const SUPABASE_SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY', envFile.SUPABASE_SERVICE_ROLE_KEY || '');
const SMOKE_EMAIL = env('SMOKE_USER_EMAIL', '');
const SMOKE_PASSWORD = env('SMOKE_USER_PASSWORD', '');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FAIL: missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
let failed = false;
let warnings = 0;

function report(name, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  const suffix = detail ? ` -> ${detail}` : '';
  console.log(`${status}: ${name}${suffix}`);
  if (!ok) failed = true;
}

function warn(name, detail = '') {
  const suffix = detail ? ` -> ${detail}` : '';
  console.log(`WARN: ${name}${suffix}`);
  warnings += 1;
}

async function checkEdgeRoute(path) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${path}`;
  try {
    const response = await fetch(url, { method: 'OPTIONS' });
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, status: -1, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  console.log('Running smoke_regression_hotfix...');

  // 1) Route reachability diagnostics
  const routes = ['evolution-proxy', 'whatsapp-webhook', 'evolution-webhook', 'evolution-api', 'whatsapp-connect'];
  for (const route of routes) {
    const result = await checkEdgeRoute(route);
    if (!result.ok) {
      report(`edge route ${route} reachable`, false, result.error);
      continue;
    }

    if ((route === 'evolution-proxy' || route === 'whatsapp-webhook') && result.status === 404) {
      warn(`edge route ${route} not deployed`, `status=${result.status}`);
      continue;
    }

    report(`edge route ${route} reachable`, true, `status=${result.status}`);
  }

  // Legacy webhook route must process directly (not depend on canonical route availability)
  try {
    const pingUrl = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/evolution-webhook`;
    const pingRes = await fetch(pingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'MESSAGES_UPSERT',
        instance: 'smoke_nonexistent_instance',
        data: {
          key: {
            remoteJid: '5511999999999@s.whatsapp.net',
            fromMe: false,
            id: `smoke_${Date.now()}`,
          },
          messageType: 'conversation',
          message: { conversation: 'smoke webhook ping' },
        },
      }),
    });
    const handlerAlive = pingRes.status !== 404 && pingRes.status !== 500;
    report('evolution-webhook POST handler active', handlerAlive, `status=${pingRes.status}`);
  } catch (error) {
    report('evolution-webhook POST handler active', false, error instanceof Error ? error.message : String(error));
  }

  // 2) Evolution fetch instances through legacy endpoint (must be available for fallback)
  const legacyFetch = await admin.functions.invoke('evolution-api', { body: { action: 'fetchInstances' } });
  const legacyOk = !legacyFetch.error && (legacyFetch.data?.success === true || Array.isArray(legacyFetch.data));
  const legacyCount = Array.isArray(legacyFetch.data?.data)
    ? legacyFetch.data.data.length
    : (Array.isArray(legacyFetch.data) ? legacyFetch.data.length : null);
  report(
    'legacy evolution-api fetchInstances',
    legacyOk,
    legacyFetch.error ? legacyFetch.error.message : `instances=${legacyCount ?? 'n/a'}`
  );

  // 3) Proxy diagnostic with authenticated user
  const { data: member, error: memberErr } = await admin
    .from('organization_members')
    .select('org_id')
    .limit(1)
    .maybeSingle();
  if (memberErr || !member?.org_id) {
    report('read org_id for proxy check', false, memberErr?.message || 'no org_id found');
  } else {
    if (SMOKE_EMAIL && SMOKE_PASSWORD && SUPABASE_ANON_KEY) {
      const { createClient } = await import('@supabase/supabase-js');
      const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const signIn = await authed.auth.signInWithPassword({
        email: SMOKE_EMAIL,
        password: SMOKE_PASSWORD,
      });
      if (signIn.error) {
        report('proxy auth sign in', false, signIn.error.message);
      } else {
        const proxyFetch = await authed.functions.invoke('evolution-proxy', {
          body: { action: 'instance-fetch', payload: {} },
        });
        report(
          'proxy evolution-proxy instance-fetch',
          !proxyFetch.error && proxyFetch.data?.success !== false,
          proxyFetch.error ? proxyFetch.error.message : 'ok'
        );
      }
    } else {
      warn('proxy evolution-proxy instance-fetch auth smoke skipped', 'set SMOKE_USER_EMAIL and SMOKE_USER_PASSWORD');
    }
  }

  // 4) Proposals RPC + fallback query validation
  if (!member?.org_id) {
    report('proposal list smoke', false, 'no org_id available');
  } else {
    const rpcList = await admin.rpc('list_proposals', {
      p_org_id: member.org_id,
      p_search: null,
      p_status: null,
      p_stage: null,
      p_owner: null,
      p_date_from: null,
      p_date_to: null,
      p_limit: 20,
      p_offset: 0,
    });

    if (rpcList.error) {
      const versions = await admin
        .from('proposal_versions')
        .select('id, proposta_id, lead_id, created_at, premium_payload')
        .eq('org_id', member.org_id)
        .order('created_at', { ascending: false })
        .limit(20);

      const fallbackOk = !versions.error;
      warn('list_proposals rpc unavailable', rpcList.error.message);
      report('list_proposals fallback query', fallbackOk, fallbackOk ? `rows=${versions.data?.length || 0}` : versions.error?.message);
    } else {
      report('list_proposals rpc', true, `rows=${rpcList.data?.length || 0}`);
    }

    const lead = await admin
      .from('leads')
      .select('id')
      .eq('org_id', member.org_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lead.error || !lead.data?.id) {
      warn('get_lead_proposals smoke skipped', lead.error?.message || 'no lead found');
    } else {
      const rpcLead = await admin.rpc('get_lead_proposals', {
        p_org_id: member.org_id,
        p_lead_id: lead.data.id,
      });

      if (rpcLead.error) {
        const fallbackLead = await admin
          .from('proposal_versions')
          .select('id, proposta_id, lead_id, version_no, created_at, status, premium_payload')
          .eq('org_id', member.org_id)
          .eq('lead_id', lead.data.id)
          .order('created_at', { ascending: false });

        warn('get_lead_proposals rpc unavailable', rpcLead.error.message);
        report(
          'get_lead_proposals fallback query',
          !fallbackLead.error,
          fallbackLead.error ? fallbackLead.error.message : `rows=${fallbackLead.data?.length || 0}`
        );
      } else {
        report('get_lead_proposals rpc', true, `rows=${rpcLead.data?.length || 0}`);
      }
    }
  }

  // 5) Mojibake scan on critical UI files
  try {
    const files = [
      'src/components/solarzap/AutomationsView.tsx',
      'src/components/solarzap/KnowledgeBaseView.tsx',
      'src/components/solarzap/ProposalsView.tsx',
      'src/hooks/useUserWhatsAppInstances.ts',
      'src/hooks/domain/useChat.ts',
    ].join(' ');

    const output = execSync(`rg -n "Ã|�|AÃ" ${files}`, { stdio: 'pipe' }).toString().trim();
    report('mojibake scan critical UI', output.length === 0, output || 'no matches');
  } catch (error) {
    // rg exits with status 1 when there are no matches -> treat as PASS
    const err = error;
    const status = typeof err === 'object' && err && 'status' in err ? Number(err.status) : null;
    const message = error instanceof Error ? error.message : String(error);
    const noMatches = status === 1 || /status 1|code: 1|exit code: 1/i.test(message);
    report('mojibake scan critical UI', noMatches, noMatches ? 'no matches' : message);
  }

  console.log(`Summary: ${failed ? 'FAILED' : 'PASSED'} with ${warnings} warning(s).`);

  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('FAIL: smoke crashed', error);
  process.exit(1);
});
