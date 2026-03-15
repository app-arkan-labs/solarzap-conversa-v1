export const ACTIVE_ORG_STORAGE_KEY = 'solarzap_active_org_id';
export const LAST_MEMBERSHIP_STORAGE_KEY = 'solarzap_last_membership';

export type PersistedMembership = {
  userId: string;
  orgId: string;
  role: string | null;
  canViewTeamLeads: boolean;
};

export const getActiveOrgId = (): string | null => {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
};

export const setActiveOrgId = (orgId: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId);
};

export const clearActiveOrgId = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
};

export const getPersistedMembership = (): PersistedMembership | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(LAST_MEMBERSHIP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedMembership>;
    if (
      typeof parsed.userId !== 'string' || !parsed.userId.trim() ||
      typeof parsed.orgId !== 'string' || !parsed.orgId.trim()
    ) {
      return null;
    }

    return {
      userId: parsed.userId.trim(),
      orgId: parsed.orgId.trim(),
      role: typeof parsed.role === 'string' && parsed.role.trim() ? parsed.role.trim() : null,
      canViewTeamLeads: parsed.canViewTeamLeads === true,
    };
  } catch {
    return null;
  }
};

export const setPersistedMembership = (membership: PersistedMembership) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAST_MEMBERSHIP_STORAGE_KEY, JSON.stringify(membership));
};

export const clearPersistedMembership = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LAST_MEMBERSHIP_STORAGE_KEY);
};
