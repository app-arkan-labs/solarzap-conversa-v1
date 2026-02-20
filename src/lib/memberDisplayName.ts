import type { User } from '@supabase/supabase-js';

type MemberLike = {
  user_id: string;
  email: string | null;
  display_name: string | null;
};

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function emailPrefix(email: string | null | undefined): string | null {
  if (!email) return null;
  const [prefix] = email.split('@');
  if (prefix && prefix.trim().length > 0) return prefix.trim();
  return email;
}

function metadataDisplayName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const map = metadata as Record<string, unknown>;
  return (
    nonEmptyString(map.display_name) ??
    nonEmptyString(map.name) ??
    nonEmptyString(map.full_name)
  );
}

export function getMemberDisplayName(member: MemberLike): string {
  return (
    nonEmptyString(member.display_name) ??
    emailPrefix(member.email) ??
    `user-${member.user_id.slice(0, 8)}`
  );
}

export function getAuthUserDisplayName(user: User | null): string {
  if (!user) return '';
  return (
    metadataDisplayName(user.user_metadata) ??
    emailPrefix(user.email) ??
    `user-${user.id.slice(0, 8)}`
  );
}

