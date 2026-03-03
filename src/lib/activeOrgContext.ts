export const ACTIVE_ORG_STORAGE_KEY = 'solarzap_active_org_id';

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
