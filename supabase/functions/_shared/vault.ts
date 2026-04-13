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

  const { data, error } = await admin
    .schema('vault')
    .from('decrypted_secrets')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    cache?.set(id, null);
    return null;
  }

  const row = data as Record<string, unknown>;
  const secret = Object.prototype.hasOwnProperty.call(row, 'decrypted_secret')
    ? cleanString(row.decrypted_secret)
    : cleanString(row.secret);

  cache?.set(id, secret);
  return secret;
}