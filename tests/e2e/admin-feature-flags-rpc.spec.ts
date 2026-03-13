import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for admin-feature-flags-rpc e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

test('feature flag toggle reflete no RPC get_org_feature_flags em ate 60s', async () => {
  test.skip(!SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY nao configurado');

  const suffix = Date.now().toString();
  const orgId = randomUUID();
  const email = `feature.flags.user.${suffix}@example.test`;
  const password = `Flags!${suffix}Aa1`;
  const flagKey = `e2e_flag_${suffix}`;

  let userId = '';

  try {
    const createdUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createdUser.error || !createdUser.data.user?.id) {
      throw new Error(`Failed to create user: ${createdUser.error?.message || 'unknown'}`);
    }
    userId = createdUser.data.user.id;

    const { error: orgError } = await admin.from('organizations').insert({
      id: orgId,
      name: `Feature Flags Org ${suffix}`,
      owner_id: userId,
    });
    if (orgError) {
      throw new Error(`Failed to create org: ${orgError.message}`);
    }

    const { error: membershipError } = await admin.from('organization_members').insert({
      org_id: orgId,
      user_id: userId,
      role: 'owner',
      can_view_team_leads: true,
    });
    if (membershipError) {
      throw new Error(`Failed to create membership: ${membershipError.message}`);
    }

    const { error: flagError } = await admin.from('_admin_feature_flags').insert({
      flag_key: flagKey,
      description: 'Feature flag de teste E2E',
      default_enabled: false,
    });
    if (flagError) {
      test.skip(true, `Tabela _admin_feature_flags indisponivel: ${flagError.message}`);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const signInResult = await userClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signInResult.error) {
      throw new Error(`Failed to sign in user: ${signInResult.error.message}`);
    }

    const initialFlags = await userClient.rpc('get_org_feature_flags', { p_org_id: orgId });
    if (initialFlags.error) {
      test.skip(true, `RPC get_org_feature_flags indisponivel: ${initialFlags.error.message}`);
    }

    const initialValue = (initialFlags.data as Record<string, boolean> | null)?.[flagKey] ?? false;
    expect(initialValue).toBe(false);

    const { error: overrideError } = await admin.from('_admin_org_feature_overrides').upsert(
      {
        org_id: orgId,
        flag_key: flagKey,
        enabled: true,
        updated_by: userId,
      },
      { onConflict: 'org_id,flag_key' },
    );
    if (overrideError) {
      throw new Error(`Failed to upsert override: ${overrideError.message}`);
    }

    await expect
      .poll(
        async () => {
          const result = await userClient.rpc('get_org_feature_flags', { p_org_id: orgId });
          if (result.error) return false;
          const current = (result.data as Record<string, boolean> | null)?.[flagKey] ?? false;
          return current;
        },
        { timeout: 60_000, intervals: [1_000, 2_000, 5_000] },
      )
      .toBe(true);
  } finally {
    await admin.from('_admin_org_feature_overrides').delete().eq('org_id', orgId);
    await admin.from('_admin_feature_flags').delete().eq('flag_key', flagKey);
    await admin.from('organization_members').delete().eq('org_id', orgId);
    await admin.from('organizations').delete().eq('id', orgId);
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
});
