import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function fetchVaultSecret(
  admin: SupabaseClient,
  vaultId: string | null | undefined,
  cache?: Map<string, string | null>,
): Promise<string | null> {
  const id = cleanString(vaultId);
  if (!id) return null;

  if (cache?.has(id)) {
    return cache.get(id) || null;
  }

  const { data, error } = await admin.rpc('solarzap_vault_read', { secret_id: id });

  if (error || !data) {
    cache?.set(id, null);
    return null;
  }

  const secret = cleanString(data);

  cache?.set(id, secret);
  return secret;
}
