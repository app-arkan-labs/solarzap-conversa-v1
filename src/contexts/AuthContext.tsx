import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  bootstrapSelf,
  isOrgAdminInvokeError,
  listUserOrgs,
  type OrgRole,
  type UserOrganizationOption,
} from '@/lib/orgAdminClient';
import { clearActiveOrgId, getActiveOrgId, setActiveOrgId } from '@/lib/activeOrgContext';

export type OrgResolutionStatus = 'idle' | 'resolving' | 'selection_required' | 'ready' | 'error';

export type OrgResolutionErrorKind =
  | 'transient'
  | 'forbidden_rls'
  | 'bootstrap_failed'
  | 'missing_after_bootstrap';

export type OrgResolutionErrorInfo = {
  kind: OrgResolutionErrorKind;
  message: string;
  status?: number;
  code?: string;
  requestId?: string | null;
};

export type SelectOrganizationOptions = {
  reload?: boolean;
};

interface AuthContextType {
  user: User | null;
  orgId: string | null;
  role: string | null;
  orgStatus: string | null;
  suspensionReason: string | null;
  canViewTeamLeads: boolean;
  organizations: UserOrganizationOption[];
  hasMultipleOrganizations: boolean;
  orgResolutionStatus: OrgResolutionStatus;
  orgResolutionError: OrgResolutionErrorInfo | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthError | null>;
  signUp: (email: string, password: string) => Promise<AuthError | null>;
  signOut: () => Promise<void>;
  selectOrganization: (orgId: string, opts?: SelectOrganizationOptions) => Promise<void>;
  clearOrganizationSelection: () => void;
}

type MembershipState = {
  orgId: string | null;
  role: OrgRole | null;
  canViewTeamLeads: boolean;
};

type MembershipQueryRow = {
  org_id: string;
  role: OrgRole;
  can_view_team_leads: boolean;
  created_at: string | null;
};

type MembershipResolution =
  | { status: 'memberships_encontradas'; memberships: MembershipQueryRow[] }
  | { status: 'membership_ausente_confirmada' }
  | {
    status: 'erro_transitorio/query';
    error: unknown;
    orgResolutionError: OrgResolutionErrorInfo;
  };

const EMPTY_MEMBERSHIP: MembershipState = {
  orgId: null,
  role: null,
  canViewTeamLeads: false,
};

const MEMBERSHIP_RETRY_DELAYS_MS = [250, 750, 1500] as const;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getErrorMessage = (error: unknown, fallback = 'Erro desconhecido'): string => {
  if (error instanceof Error && error.message) return error.message;
  if (isRecord(error) && typeof error.message === 'string' && error.message) return error.message;
  return fallback;
};

const getErrorCode = (error: unknown): string | undefined => {
  if (!isRecord(error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (!isRecord(error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
};

const isExpiredAuthMembershipError = (error: unknown) => {
  const status = getErrorStatus(error);
  const code = getErrorCode(error);
  const message = getErrorMessage(error, '').toLowerCase();

  if (status === 401) return true;
  if (code === 'PGRST303') return true;

  return (
    message.includes('jwt expired') ||
    message.includes('invalid jwt') ||
    message.includes('token is expired') ||
    message.includes('token has expired')
  );
};

const isForbiddenMembershipError = (error: unknown) => {
  if (isExpiredAuthMembershipError(error)) return false;

  const status = getErrorStatus(error);
  const code = getErrorCode(error);
  const message = getErrorMessage(error, '').toLowerCase();

  if (status === 403) return true;
  if (code && ['42501', 'PGRST301', 'PGRST302'].includes(code)) return true;

  return (
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('forbidden')
  );
};

const toMembershipQueryOrgError = (error: unknown): OrgResolutionErrorInfo => {
  const status = getErrorStatus(error);
  const code = getErrorCode(error);
  const kind: OrgResolutionErrorKind = isForbiddenMembershipError(error) ? 'forbidden_rls' : 'transient';

  return {
    kind,
    message: getErrorMessage(error, 'Falha ao ler organization_members.'),
    ...(typeof status === 'number' ? { status } : {}),
    ...(code ? { code } : {}),
  };
};

const toBootstrapOrgError = (error: unknown): OrgResolutionErrorInfo => {
  const message = getErrorMessage(error, 'Falha ao executar bootstrap_self.');
  if (isOrgAdminInvokeError(error)) {
    return {
      kind: 'bootstrap_failed',
      message,
      ...(typeof error.status === 'number' ? { status: error.status } : {}),
      ...(error.code ? { code: error.code } : {}),
      requestId: error.requestId,
    };
  }

  return {
    kind: 'bootstrap_failed',
    message,
    ...(typeof getErrorStatus(error) === 'number' ? { status: getErrorStatus(error) } : {}),
    ...(getErrorCode(error) ? { code: getErrorCode(error) } : {}),
  };
};

const canRoleViewTeamLeads = (candidateRole: string | null) =>
  candidateRole === 'owner' || candidateRole === 'admin';

const isValidOrgRole = (candidate: unknown): candidate is OrgRole =>
  candidate === 'owner' || candidate === 'admin' || candidate === 'user' || candidate === 'consultant';

const toMembershipState = (membership: MembershipQueryRow | UserOrganizationOption): MembershipState => {
  const role = membership.role;
  return {
    orgId: membership.org_id,
    role,
    canViewTeamLeads: canRoleViewTeamLeads(role) || membership.can_view_team_leads === true,
  };
};

const toFallbackOrgOption = (membership: MembershipQueryRow): UserOrganizationOption => ({
  org_id: membership.org_id,
  role: membership.role,
  can_view_team_leads: membership.can_view_team_leads === true,
  joined_at: membership.created_at ?? new Date(0).toISOString(),
  company_name: null,
  organization_name: null,
  display_name: `Organizacao ${membership.org_id.slice(0, 8)}`,
});

const sortOrgOptions = (orgs: UserOrganizationOption[]) =>
  [...orgs].sort((a, b) => {
    const byName = a.display_name.localeCompare(b.display_name, 'pt-BR');
    if (byName !== 0) return byName;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });

const AUTH_ENTRY_EVENTS_REQUIRING_SELECTION = new Set(['SIGNED_IN', 'PASSWORD_RECOVERY']);

const shouldForceOrgSelectionForEntryEvent = (source: string): boolean => {
  if (source === 'PASSWORD_RECOVERY') {
    return true;
  }

  if (source !== 'SIGNED_IN') {
    return false;
  }

  if (typeof window === 'undefined') {
    return true;
  }

  const pathname = window.location.pathname || '';
  if (pathname === '/login') {
    return true;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash || '';
  const hashQueryStart = hash.indexOf('?');
  const hashQuery = hashQueryStart >= 0 ? hash.slice(hashQueryStart + 1) : hash.replace(/^#/, '');
  const hashParams = new URLSearchParams(hashQuery);

  const authMarkerKeys = ['access_token', 'refresh_token', 'type', 'expires_in', 'token_type'];
  const hasAuthCallbackMarkers = authMarkerKeys.some(
    (key) => searchParams.has(key) || hashParams.has(key),
  );

  return hasAuthCallbackMarkers;
};

const getOrgHintFromLocation = (): string | null => {
  if (typeof window === 'undefined') return null;

  const searchCandidate = new URLSearchParams(window.location.search).get('org_hint');
  if (typeof searchCandidate === 'string' && searchCandidate.trim().length > 0) {
    return searchCandidate.trim();
  }

  const hash = window.location.hash || '';
  const hashQueryStart = hash.indexOf('?');
  if (hashQueryStart >= 0) {
    const hashQuery = hash.slice(hashQueryStart + 1);
    const hashCandidate = new URLSearchParams(hashQuery).get('org_hint');
    if (typeof hashCandidate === 'string' && hashCandidate.trim().length > 0) {
      return hashCandidate.trim();
    }
  }

  return null;
};

const isUpdatePasswordPath = (pathname: string): boolean => {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/update-password' || normalized.endsWith('/update-password');
};

const hasPasswordRecoveryMarker = (): boolean => {
  if (typeof window === 'undefined') return false;
  const searchMarker = new URLSearchParams(window.location.search).get('password_recovery');
  return searchMarker === '1' || searchMarker === 'true';
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [role, setRole] = useState<OrgRole | null>(null);
  const [orgStatus, setOrgStatus] = useState<string | null>(null);
  const [suspensionReason, setSuspensionReason] = useState<string | null>(null);
  const [canViewTeamLeads, setCanViewTeamLeads] = useState(false);
  const [organizations, setOrganizations] = useState<UserOrganizationOption[]>([]);
  const [orgResolutionStatus, setOrgResolutionStatus] = useState<OrgResolutionStatus>('idle');
  const [orgResolutionError, setOrgResolutionError] = useState<OrgResolutionErrorInfo | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const lastGoodMembershipRef = useRef<{ userId: string; membership: MembershipState } | null>(null);
  const activeUserIdRef = useRef<string | null>(null);
  const applySessionSeqRef = useRef(0);

  const hasMultipleOrganizations = useMemo(() => organizations.length > 1, [organizations]);

  const setMembershipState = (membership: MembershipState) => {
    setOrgId(membership.orgId);
    setRole(membership.role);
    setCanViewTeamLeads(membership.canViewTeamLeads);
    setOrgStatus(null);
    setSuspensionReason(null);
  };

  const markOrgResolving = () => {
    setOrgResolutionStatus('resolving');
    setOrgResolutionError(null);
  };

  const markOrgReady = () => {
    setOrgResolutionStatus('ready');
    setOrgResolutionError(null);
  };

  const markOrgSelectionRequired = () => {
    setOrgResolutionStatus('selection_required');
    setOrgResolutionError(null);
  };

  const markOrgError = (error: OrgResolutionErrorInfo) => {
    setOrgResolutionStatus('error');
    setOrgResolutionError(error);
  };

  const getLastGoodMembership = (userId: string): MembershipState | null => {
    const cached = lastGoodMembershipRef.current;
    if (!cached || cached.userId !== userId) return null;
    if (!cached.membership.orgId) return null;
    return cached.membership;
  };

  const rememberLastGoodMembership = (userId: string, membership: MembershipState) => {
    if (!membership.orgId) return;
    lastGoodMembershipRef.current = { userId, membership };
  };

  const resolveMembershipsOnce = async (userId: string): Promise<MembershipResolution> => {
    try {
      const { data, error } = await supabase
        .from('organization_members')
        .select('org_id, role, can_view_team_leads, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .order('org_id', { ascending: true });

      if (error) {
        return {
          status: 'erro_transitorio/query',
          error,
          orgResolutionError: toMembershipQueryOrgError(error),
        };
      }

      const memberships = (data ?? []).filter(
        (row): row is MembershipQueryRow =>
          typeof row.org_id === 'string' &&
          typeof row.role === 'string' &&
          isValidOrgRole(row.role),
      );

      if (memberships.length === 0) {
        return { status: 'membership_ausente_confirmada' };
      }

      return {
        status: 'memberships_encontradas',
        memberships,
      };
    } catch (error) {
      return {
        status: 'erro_transitorio/query',
        error,
        orgResolutionError: toMembershipQueryOrgError(error),
      };
    }
  };

  const resolveMembershipsWithRetry = async (userId: string, source: string): Promise<MembershipResolution> => {
    let lastTransient: Extract<MembershipResolution, { status: 'erro_transitorio/query' }> | null = null;

    for (let attempt = 0; attempt <= MEMBERSHIP_RETRY_DELAYS_MS.length; attempt += 1) {
      if (attempt > 0) {
        const delayMs = MEMBERSHIP_RETRY_DELAYS_MS[attempt - 1];
        console.warn(`[AuthContext] [${source}] membership query retry scheduled`, {
          attempt: attempt + 1,
          delayMs,
          userId,
        });
        await sleep(delayMs);
      }

      const resolution = await resolveMembershipsOnce(userId);
      if (resolution.status !== 'erro_transitorio/query') {
        return resolution;
      }

      lastTransient = resolution;
      console.error(`[AuthContext] [${source}] membership query failed`, {
        attempt: attempt + 1,
        userId,
        error: resolution.error,
      });
    }

    return (
      lastTransient ?? {
        status: 'erro_transitorio/query',
        error: new Error('membership_query_failed'),
        orgResolutionError: {
          kind: 'transient',
          message: 'Falha ao resolver membership apos retries.',
        },
      }
    );
  };

  const hydrateOrganizations = async (memberships: MembershipQueryRow[]): Promise<UserOrganizationOption[]> => {
    const fallback = sortOrgOptions(memberships.map(toFallbackOrgOption));
    const fallbackByOrgId = new Map(fallback.map((item) => [item.org_id, item]));

    const enrichFromClientTables = async (base: UserOrganizationOption[]) => {
      const orgIds = memberships.map((membership) => membership.org_id);
      if (orgIds.length === 0) return base;

      const [companyResult, organizationsResult] = await Promise.all([
        supabase.from('company_profile').select('org_id, company_name').in('org_id', orgIds),
        supabase.from('organizations').select('id, name').in('id', orgIds),
      ]);

      const companyNameByOrgId: Record<string, string> = {};
      if (!companyResult.error) {
        for (const row of companyResult.data ?? []) {
          if (typeof row.org_id !== 'string') continue;
          const companyName = typeof row.company_name === 'string' ? row.company_name.trim() : '';
          if (companyName) {
            companyNameByOrgId[row.org_id] = companyName;
          }
        }
      }

      const organizationNameByOrgId: Record<string, string> = {};
      if (!organizationsResult.error) {
        for (const row of organizationsResult.data ?? []) {
          if (typeof row.id !== 'string') continue;
          const organizationName = typeof row.name === 'string' ? row.name.trim() : '';
          if (organizationName) {
            organizationNameByOrgId[row.id] = organizationName;
          }
        }
      }

      return sortOrgOptions(
        base.map((item) => {
          const companyName = companyNameByOrgId[item.org_id] || item.company_name || null;
          const organizationName = organizationNameByOrgId[item.org_id] || item.organization_name || null;
          const displayName = companyName || organizationName || item.display_name;

          return {
            ...item,
            company_name: companyName,
            organization_name: organizationName,
            display_name: displayName,
          };
        }),
      );
    };

    try {
      const response = await listUserOrgs();
      const fromApi = response.orgs ?? [];
      if (fromApi.length === 0) {
        return await enrichFromClientTables(fallback);
      }

      const merged = fromApi
        .filter((item) => typeof item.org_id === 'string')
        .map((item) => {
          const fallbackItem = fallbackByOrgId.get(item.org_id);
          if (!fallbackItem) return item;
          return {
            ...item,
            role: fallbackItem.role,
            can_view_team_leads: fallbackItem.can_view_team_leads,
            joined_at: fallbackItem.joined_at,
            display_name: item.display_name || fallbackItem.display_name,
          };
        });

      for (const fallbackItem of fallback) {
        if (!merged.some((item) => item.org_id === fallbackItem.org_id)) {
          merged.push(fallbackItem);
        }
      }

      return await enrichFromClientTables(merged);
    } catch (error) {
      console.warn('[AuthContext] Failed to hydrate list_user_orgs; using fallback', error);
      return await enrichFromClientTables(fallback);
    }
  };

  const resolveSelectedMembership = (
    memberships: MembershipQueryRow[],
    source: string,
    orgHint: string | null,
  ): MembershipState | null => {
    if (orgHint) {
      const hinted = memberships.find((membership) => membership.org_id === orgHint);
      if (hinted) {
        return toMembershipState(hinted);
      }
    }

    if (memberships.length === 1) {
      return toMembershipState(memberships[0]);
    }

    const activeOrgId = getActiveOrgId();
    const selected = activeOrgId
      ? memberships.find((membership) => membership.org_id === activeOrgId)
      : null;

    // If the current active org is still valid, keep it stable across auth events.
    if (selected) {
      return toMembershipState(selected);
    }

    if (AUTH_ENTRY_EVENTS_REQUIRING_SELECTION.has(source) && shouldForceOrgSelectionForEntryEvent(source)) {
      return null;
    }

    return null;
  };

  useEffect(() => {
    let mounted = true;

    const applySessionState = async (nextSession: Session | null, source: string) => {
      const seq = ++applySessionSeqRef.current;
      const isCurrent = () => mounted && seq === applySessionSeqRef.current;
      if (!isCurrent()) return;

      setSession(nextSession);
      const nextUser = nextSession?.user ?? null;
      setUser(nextUser);
      const previousActiveUserId = activeUserIdRef.current;
      activeUserIdRef.current = nextUser?.id ?? null;
      const orgHint = getOrgHintFromLocation();

      if (!nextUser) {
        lastGoodMembershipRef.current = null;
        setOrganizations([]);
        clearActiveOrgId();
        setMembershipState(EMPTY_MEMBERSHIP);
        setOrgResolutionStatus('idle');
        setOrgResolutionError(null);
        return;
      }

      markOrgResolving();

      if (previousActiveUserId && previousActiveUserId !== nextUser.id) {
        setOrganizations([]);
        clearActiveOrgId();
        setMembershipState(EMPTY_MEMBERSHIP);
      }

      const cachedMembership = getLastGoodMembership(nextUser.id);

      const applyBootstrapMembership = async (bootstrapSource: string, queryError?: OrgResolutionErrorInfo) => {
        let bootstrapResult: Awaited<ReturnType<typeof bootstrapSelf>>;
        try {
          bootstrapResult = await bootstrapSelf();
        } catch (bootstrapError) {
          if (!isCurrent()) return;
          markOrgError(queryError?.kind === 'forbidden_rls' ? queryError : toBootstrapOrgError(bootstrapError));
          return;
        }

        if (!isCurrent()) return;

        const bootstrapRole = isValidOrgRole(bootstrapResult.role) ? bootstrapResult.role : null;
        const bootstrapMembership: MembershipState = {
          orgId: bootstrapResult.org_id,
          role: bootstrapRole,
          canViewTeamLeads: canRoleViewTeamLeads(bootstrapRole),
        };

        if (bootstrapMembership.orgId) {
          setActiveOrgId(bootstrapMembership.orgId);
        }
        rememberLastGoodMembership(nextUser.id, bootstrapMembership);
        setMembershipState(bootstrapMembership);
        setOrganizations(sortOrgOptions([
          {
            org_id: bootstrapMembership.orgId || bootstrapResult.org_id,
            role: bootstrapRole || 'owner',
            can_view_team_leads: bootstrapMembership.canViewTeamLeads,
            joined_at: new Date().toISOString(),
            company_name: null,
            organization_name: null,
            display_name: `Organizacao ${bootstrapResult.org_id.slice(0, 8)}`,
          },
        ]));
        markOrgReady();

        void (async () => {
          const postBootstrap = await resolveMembershipsWithRetry(nextUser.id, `${bootstrapSource}:post_bootstrap`);
          if (!isCurrent()) return;

          if (postBootstrap.status === 'memberships_encontradas') {
            const hydratedOrganizations = await hydrateOrganizations(postBootstrap.memberships);
            if (!isCurrent()) return;
            setOrganizations(hydratedOrganizations);

            const selected = resolveSelectedMembership(postBootstrap.memberships, 'init', orgHint);
            if (selected?.orgId) {
              setActiveOrgId(selected.orgId);
              rememberLastGoodMembership(nextUser.id, selected);
              setMembershipState(selected);
              markOrgReady();
              return;
            }

            clearActiveOrgId();
            setMembershipState(EMPTY_MEMBERSHIP);
            markOrgSelectionRequired();
            return;
          }

          if (postBootstrap.status === 'erro_transitorio/query') {
            console.warn(`[AuthContext] [${bootstrapSource}] post-bootstrap membership query failed; keeping bootstrap state`, {
              userId: nextUser.id,
              kind: postBootstrap.orgResolutionError.kind,
              status: postBootstrap.orgResolutionError.status,
              code: postBootstrap.orgResolutionError.code,
            });
            return;
          }

          setMembershipState(EMPTY_MEMBERSHIP);
          setOrganizations([]);
          clearActiveOrgId();
          markOrgError({
            kind: 'missing_after_bootstrap',
            message: 'Membership ainda ausente apos bootstrap_self.',
          });
        })();
      };

      const resolution = await resolveMembershipsWithRetry(nextUser.id, source);
      if (!isCurrent()) return;

      if (resolution.status === 'memberships_encontradas') {
        const hydratedOrganizations = await hydrateOrganizations(resolution.memberships);
        if (!isCurrent()) return;

        setOrganizations(hydratedOrganizations);
        const selectedMembership = resolveSelectedMembership(resolution.memberships, source, orgHint);
        if (selectedMembership?.orgId) {
          setActiveOrgId(selectedMembership.orgId);
          rememberLastGoodMembership(nextUser.id, selectedMembership);
          setMembershipState(selectedMembership);
          markOrgReady();
          return;
        }

        clearActiveOrgId();
        setMembershipState(EMPTY_MEMBERSHIP);
        markOrgSelectionRequired();
        return;
      }

      if (resolution.status === 'erro_transitorio/query') {
        if (isExpiredAuthMembershipError(resolution.error)) {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (!isCurrent()) return;

          if (refreshError || !refreshed.session) {
            await supabase.auth.signOut();
            return;
          }

          window.location.reload();
          return;
        }

        if (cachedMembership?.orgId && !AUTH_ENTRY_EVENTS_REQUIRING_SELECTION.has(source)) {
          setMembershipState(cachedMembership);
          setOrganizations(sortOrgOptions([
            {
              org_id: cachedMembership.orgId,
              role: cachedMembership.role || 'user',
              can_view_team_leads: cachedMembership.canViewTeamLeads,
              joined_at: new Date(0).toISOString(),
              company_name: null,
              organization_name: null,
              display_name: `Organizacao ${cachedMembership.orgId.slice(0, 8)}`,
            },
          ]));
          markOrgReady();
          return;
        }

        markOrgError(resolution.orgResolutionError);
        return;
      }

      if (resolution.status === 'membership_ausente_confirmada') {
        await applyBootstrapMembership(source);
        return;
      }

      markOrgError({
        kind: 'transient',
        message: 'Falha ao resolver organizacao para a sessao atual.',
      });
    };

    const initAuth = async () => {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error('Error getting session:', error);
        }

        await applySessionState(initialSession, 'init');
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (
        typeof window !== 'undefined' &&
        !isUpdatePasswordPath(window.location.pathname) &&
        (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && hasPasswordRecoveryMarker()))
      ) {
        const recoveryUrl = new URL('/update-password', window.location.origin);
        recoveryUrl.search = window.location.search;
        recoveryUrl.hash = window.location.hash;
        window.location.replace(recoveryUrl.toString());
        return;
      }

      void (async () => {
        await applySessionState(newSession, event);
        if (mounted) {
          setLoading(false);
        }
      })();
    });

    initAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadOrgStatus = async () => {
      if (!user?.id || !orgId) {
        if (mounted) {
          setOrgStatus(null);
          setSuspensionReason(null);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('status, suspension_reason')
          .eq('id', orgId)
          .maybeSingle();

        if (!mounted) return;
        if (error || !data) {
          setOrgStatus(null);
          setSuspensionReason(null);
          return;
        }

        setOrgStatus(typeof data.status === 'string' ? data.status : null);
        setSuspensionReason(
          typeof data.suspension_reason === 'string' ? data.suspension_reason : null,
        );
      } catch {
        if (!mounted) return;
        setOrgStatus(null);
        setSuspensionReason(null);
      }
    };

    void loadOrgStatus();

    return () => {
      mounted = false;
    };
  }, [user?.id, orgId]);

  const selectOrganization = async (nextOrgId: string, opts?: SelectOrganizationOptions) => {
    const option = organizations.find((item) => item.org_id === nextOrgId);
    if (!option) {
      throw new Error('Organizacao selecionada nao encontrada no contexto atual.');
    }

    const membership = toMembershipState(option);
    if (membership.orgId) {
      setActiveOrgId(membership.orgId);
      if (user?.id) {
        rememberLastGoodMembership(user.id, membership);
      }
    }
    setMembershipState(membership);
    markOrgReady();

    if (opts?.reload === true) {
      window.location.assign('/');
    }
  };

  const clearOrganizationSelection = () => {
    clearActiveOrgId();
    setMembershipState(EMPTY_MEMBERSHIP);

    if (user && organizations.length > 1) {
      markOrgSelectionRequired();
      return;
    }

    if (user) {
      markOrgResolving();
      return;
    }

    setOrgResolutionStatus('idle');
    setOrgResolutionError(null);
  };

  const signIn = async (email: string, password: string): Promise<AuthError | null> => {
    try {
      // Explicit login must not inherit organization from a previous user/session.
      clearActiveOrgId();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return error;
    } catch (error) {
      console.error('Sign in error:', error);
      return { message: 'Erro ao fazer login', name: 'AuthError', status: 500 } as AuthError;
    }
  };

  const signUp = async (email: string, password: string): Promise<AuthError | null> => {
    try {
      const redirectUrl = window.location.origin;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });
      return error;
    } catch (error) {
      console.error('Sign up error:', error);
      return { message: 'Erro ao criar conta', name: 'AuthError', status: 500 } as AuthError;
    }
  };

  const signOut = async () => {
    try {
      lastGoodMembershipRef.current = null;
      activeUserIdRef.current = null;
      setOrganizations([]);
      clearActiveOrgId();
      setMembershipState(EMPTY_MEMBERSHIP);
      setOrgResolutionStatus('idle');
      setOrgResolutionError(null);
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const value: AuthContextType = {
    user,
    orgId,
    role,
    orgStatus,
    suspensionReason,
    canViewTeamLeads,
    organizations,
    hasMultipleOrganizations,
    orgResolutionStatus,
    orgResolutionError,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    selectOrganization,
    clearOrganizationSelection,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
