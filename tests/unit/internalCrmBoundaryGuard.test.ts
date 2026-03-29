import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');
const INTERNAL_CRM_API_PATH = path.resolve(ROOT, 'supabase/functions/internal-crm-api/index.ts');
const BRIDGE_RPC_PATH = path.resolve(ROOT, 'supabase/migrations/20260328000500_internal_crm_bridge_rpc.sql');
const INTERNAL_CRM_MODULE_DIR = path.resolve(ROOT, 'src/modules/internal-crm');

const FORBIDDEN_PUBLIC_RUNTIME_TABLES = [
  'organizations',
  'organization_members',
  'leads',
  'propostas',
  'interacoes',
  'lead_attribution',
  'attribution_touchpoints',
  'conversion_events',
];

const FORBIDDEN_RUNTIME_HOOK_IMPORTS: Array<{ label: string; regex: RegExp }> = [
  {
    label: 'tenant runtime hook useLeads',
    regex: /from\s+['"][^'"]*\/hooks\/domain\/useLeads['"]/,
  },
  {
    label: 'tenant runtime hook useChat',
    regex: /from\s+['"][^'"]*\/hooks\/domain\/useChat['"]/,
  },
  {
    label: 'tenant runtime hook usePipeline',
    regex: /from\s+['"][^'"]*\/hooks\/domain\/usePipeline['"]/,
  },
  {
    label: 'tenant runtime hook useBroadcasts',
    regex: /from\s+['"][^'"]*\/hooks\/useBroadcasts['"]/,
  },
  {
    label: 'tenant runtime hook useAISettings',
    regex: /from\s+['"][^'"]*\/hooks\/useAISettings['"]/,
  },
  {
    label: 'tenant runtime hook useUserWhatsAppInstances',
    regex: /from\s+['"][^'"]*\/hooks\/useUserWhatsAppInstances['"]/,
  },
];

function listInternalCrmModuleFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listInternalCrmModuleFiles(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('internal CRM boundary guard rails', () => {
  it('keeps internal-crm-api pinned to internal_crm writes and allowed bridges', () => {
    const content = fs.readFileSync(INTERNAL_CRM_API_PATH, 'utf8');
    const findings: string[] = [];

    if (/serviceClient\.from\(/.test(content)) {
      findings.push('direct serviceClient.from(...) usage found; table reads/writes must use crmSchema(serviceClient)');
    }

    if (/serviceClient\.schema\(\s*['"]public['"]\s*\)\.from\(/.test(content)) {
      findings.push('serviceClient.schema("public").from(...) usage found in internal-crm-api');
    }

    for (const table of FORBIDDEN_PUBLIC_RUNTIME_TABLES) {
      const tablePattern = new RegExp(`\\.from\\(\\s*['"]${table}['"]\\s*\\)`);
      if (tablePattern.test(content)) {
        findings.push(`forbidden runtime table reference found: ${table}`);
      }
    }

    const crmSchemaPattern = /function\s+crmSchema\s*\([^)]*\)\s*\{[\s\S]*?return\s+serviceClient\.schema\(\s*['"]internal_crm['"]\s*\);[\s\S]*?\}/m;
    if (!crmSchemaPattern.test(content)) {
      findings.push('crmSchema helper is not pinned to serviceClient.schema("internal_crm")');
    }

    expect(findings).toEqual([]);
  });

  it('keeps crm_bridge_org_summary read-only against public runtime data', () => {
    const content = fs.readFileSync(BRIDGE_RPC_PATH, 'utf8');
    const forbiddenMutationPatterns: Array<{ label: string; regex: RegExp }> = [
      { label: 'INSERT INTO public.*', regex: /\bINSERT\s+INTO\s+public\./i },
      { label: 'UPDATE public.*', regex: /\bUPDATE\s+public\./i },
      { label: 'DELETE FROM public.*', regex: /\bDELETE\s+FROM\s+public\./i },
      { label: 'TRUNCATE public.*', regex: /\bTRUNCATE\s+(?:TABLE\s+)?public\./i },
      { label: 'MERGE INTO public.*', regex: /\bMERGE\s+INTO\s+public\./i },
    ];

    const hits = forbiddenMutationPatterns
      .filter((entry) => entry.regex.test(content))
      .map((entry) => entry.label);

    expect(hits).toEqual([]);
  });

  it('blocks internal CRM module imports from tenant runtime hooks', () => {
    const files = listInternalCrmModuleFiles(INTERNAL_CRM_MODULE_DIR);
    const findings: string[] = [];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(ROOT, filePath).replace(/\\/g, '/');

      for (const pattern of FORBIDDEN_RUNTIME_HOOK_IMPORTS) {
        if (pattern.regex.test(content)) {
          findings.push(`${relativePath}: ${pattern.label}`);
        }
      }
    }

    expect(findings).toEqual([]);
  });
});
