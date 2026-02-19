#!/usr/bin/env node
// SQL runner via Supabase Management API
// Usage: node scripts/m0_run_sql.mjs <sql_file>

import { readFileSync } from 'fs';
import { argv, env, exit } from 'process';

const PROJECT_REF = env.SUPABASE_PROJECT_REF || 'ucwmcmdwbvrwotuzlmxh';
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;
const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

const sqlFile = argv[2];
if (!sqlFile) {
  console.error('Usage: node scripts/m0_run_sql.mjs <sql_file>');
  exit(1);
}

if (!ACCESS_TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN env var.');
  console.error('Set it before running this script.');
  exit(1);
}

const sql = readFileSync(sqlFile, 'utf8');

const res = await fetch(API_URL, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
try {
  const json = JSON.parse(text);
  console.log(JSON.stringify(json, null, 2));
} catch {
  console.log(text);
}

if (!res.ok) {
  exit(1);
}
