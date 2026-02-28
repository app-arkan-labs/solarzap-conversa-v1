import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { bootstrapSelf, isOrgAdminInvokeError } from '@/lib/orgAdminClient';

export type OrgResolutionStatus = 'idle' | 'resolving' | 'ready' | 'error';

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

interface AuthContextType {
  user: User | null;
  orgId: string | null;
  role: string | null;
  canViewTeamLeads: boolean;
  orgResolutionStatus: OrgResolutionStatus;
  orgResolutionError: OrgResolutionErrorInfo | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthError | null>;
  signUp: (email: string, password: string) => Promise<AuthError | null>;
  signOut: () => Promise<void>;
}

type MembershipState = {
  orgId: string | null;
  role: string | null;
  canViewTeamLeads: boolean;
};

type MembershipResolution =
  | { status: 'membership_encontrada'; membership: MembershipState }
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

const isForbiddenMembershipError = (error: unknown) => {
  const status = getErrorStatus(error);
  const code = getErrorCode(error);
  const message = getErrorMessage(error, '').toLowerCase();

  if (status === 401 || status === 403) return true;
  if (code && ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)) return true;

  return (
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('forbidden') ||
    message.includes('unauthorized')
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
  const [role, setRole] = useState<string | null>(null);
  const [canViewTeamLeads, setCanViewTeamLeads] = useState(false);
  const [orgResolutionStatus, setOrgResolutionStatus] = useState<OrgResolutionStatus>('idle');
  const [orgResolutionError, setOrgResolutionError] = useState<OrgResolutionErrorInfo | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const lastGoodMembershipRef = useRef<{ userId: string; membership: MembershipState } | null>(null);
  const activeUserIdRef = useRef<string | null>(null);
  const applySessionSeqRef = useRef(0);

  const setMembershipState = (membership: MembershipState) => {
    setOrgId(membership.orgId);
    setRole(membership.role);
    setCanViewTeamLeads(membership.canViewTeamLeads);
  };

  const markOrgResolving = () => {
    setOrgResolutionStatus('resolving');
    setOrgResolutionError(null);
  };

  const markOrgReady = () => {
    setOrgResolutionStatus('ready');
    setOrgResolutionError(null);
  };

  const markOrgError = (error: OrgResolutionErrorInfo) => {
    setOrgResolutionStatus('error');
    setOrgResolutionError(error);
  };

  const resolveMembershipOnce = async (userId: string): Promise<MembershipResolution> => {
    try {
      const { data, error } = await supabase
        .from('organization_members')
        .select('org_id, role, can_view_team_leads, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .order('org_id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        return {
          status: 'erro_transitorio/query',
          error,
          orgResolutionError: toMembershipQueryOrgError(error),
        };
      }

      if (!data?.org_id) {
        return {
          status: 'membership_ausente_confirmada',
        };
      }

      const resolvedRole = typeof data.role === 'string' ? data.role : null;
      return {
        status: 'membership_encontrada',
        membership: {
          orgId: data.org_id,
          role: resolvedRole,
          canViewTeamLeads: canRoleViewTeamLeads(resolvedRole) || data.can_view_team_leads === true,
        },
      };
    } catch (err) {
      return {
        status: 'erro_transitorio/query',
        error: err,
        orgResolutionError: toMembershipQueryOrgError(err),
      };
    }
  };

  const resolveMembershipWithRetry = async (userId: string, source: string): Promise<MembershipResolution> => {
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

      const resolution = await resolveMembershipOnce(userId);

      if (resolution.status !== 'erro_transitorio/query') {
        console.info(`[AuthContext] [${source}] membership resolution result`, {
          status: resolution.status,
          userId,
          orgId: resolution.status === 'membership_encontrada' ? resolution.membership.orgId : null,
        });
        return resolution;
      }

      lastTransient = resolution;
      console.error(`[AuthContext] [${source}] membership query failed`, {
        attempt: attempt + 1,
        userId,
        error: resolution.error,
      });
    }

    console.error(`[AuthContext] [${source}] membership resolution exhausted retries`, {
      userId,
      retries: MEMBERSHIP_RETRY_DELAYS_MS.length,
      error: lastTransient?.error,
    });

    return (
      lastTransient ?? {
        status: 'erro_transitorio/query',
        error: new Error('membership_query_failed'),
        orgResolutionError: {
          kind: 'transient',
          message: 'Falha ao resolver membership após retries.',
        },
      }
    );
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

      if (!nextUser) {
        lastGoodMembershipRef.current = null;
        setMembershipState(EMPTY_MEMBERSHIP);
        setOrgResolutionStatus('idle');
        setOrgResolutionError(null);
        console.info(`[AuthContext] [${source}] session cleared`);
        return;
      }

      markOrgResolving();

      if (previousActiveUserId && previousActiveUserId !== nextUser.id) {
        // Prevent cross-user membership leakage while the next membership resolves.
        setMembershipState(EMPTY_MEMBERSHIP);
      }

      const cachedMembership = getLastGoodMembership(nextUser.id);
      const resolution = await resolveMembershipWithRetry(nextUser.id, source);
      if (!isCurrent()) return;

      if (resolution.status === 'membership_encontrada') {
        rememberLastGoodMembership(nextUser.id, resolution.membership);
        setMembershipState(resolution.membership);
        markOrgReady();
        return;
      }

      if (resolution.status === 'erro_transitorio/query') {
        if (cachedMembership) {
          console.warn(`[AuthContext] [${source}] preserving cached membership after transient error`, {
            userId: nextUser.id,
            orgId: cachedMembership.orgId,
          });
          setMembershipState(cachedMembership);
          markOrgReady();
          return;
        }

        console.warn(`[AuthContext] [${source}] transient membership error with no cached membership`, {
          userId: nextUser.id,
          kind: resolution.orgResolutionError.kind,
          status: resolution.orgResolutionError.status,
          code: resolution.orgResolutionError.code,
        });

        console.warn(`[AuthContext] [${source}] attempting bootstrap_self after membership query error`, {
          userId: nextUser.id,
          kind: resolution.orgResolutionError.kind,
        });

        let bootstrapResult: Awaited<ReturnType<typeof bootstrapSelf>>;
        try {
          bootstrapResult = await bootstrapSelf();
        } catch (bootstrapError) {
          console.error(`[AuthContext] [${source}] membership bootstrap error after query failure`, bootstrapError);
          markOrgError(resolution.orgResolutionError.kind === 'forbidden_rls' ? resolution.orgResolutionError : toBootstrapOrgError(bootstrapError));
          return;
        }

        if (!isCurrent()) return;

        const bootstrapRole = typeof bootstrapResult.role === 'string' ? bootstrapResult.role : null;
        const bootstrapMembership: MembershipState = {
          orgId: bootstrapResult.org_id,
          role: bootstrapRole,
          canViewTeamLeads: canRoleViewTeamLeads(bootstrapRole),
        };

        rememberLastGoodMembership(nextUser.id, bootstrapMembership);
        setMembershipState(bootstrapMembership);
        markOrgReady();

        void (async () => {
          try {
            const postBootstrap = await resolveMembershipWithRetry(nextUser.id, `${source}:post_bootstrap_after_query_error`);
            if (!isCurrent()) return;

            if (postBootstrap.status === 'membership_encontrada') {
              rememberLastGoodMembership(nextUser.id, postBootstrap.membership);
              setMembershipState(postBootstrap.membership);
              markOrgReady();
              return;
            }

            if (postBootstrap.status === 'erro_transitorio/query') {
              console.warn(
                `[AuthContext] [${source}] post-bootstrap membership query failed after query-error recovery; keeping bootstrap state`,
                {
                  userId: nextUser.id,
                  kind: postBootstrap.orgResolutionError.kind,
                  status: postBootstrap.orgResolutionError.status,
                  code: postBootstrap.orgResolutionError.code,
                },
              );
              return;
            }

            console.warn(`[AuthContext] [${source}] membership still missing after bootstrap (query-error recovery path)`, {
              userId: nextUser.id,
            });
            setMembershipState(EMPTY_MEMBERSHIP);
            markOrgError({
              kind: 'missing_after_bootstrap',
              message: 'Membership ainda ausente após bootstrap_self.',
            });
          } catch (postBootstrapError) {
            if (!isCurrent()) return;
            console.error(`[AuthContext] [${source}] unexpected post-bootstrap reconciliation error`, postBootstrapError);
          }
        })();
        return;
      }

      // Confirmed "no membership" without query error.
      if (cachedMembership) {
        console.warn(`[AuthContext] [${source}] membership missing but cached membership exists; preserving cache`, {
          userId: nextUser.id,
          orgId: cachedMembership.orgId,
        });
        setMembershipState(cachedMembership);
        markOrgReady();
        return;
      }

      let bootstrapResult: Awaited<ReturnType<typeof bootstrapSelf>>;
      try {
        console.warn(`[AuthContext] [${source}] membership missing; attempting bootstrap_self`, {
          userId: nextUser.id,
        });
        bootstrapResult = await bootstrapSelf();
      } catch (bootstrapError) {
        console.error(`[AuthContext] [${source}] membership bootstrap error`, bootstrapError);
        if (cachedMembership) {
          setMembershipState(cachedMembership);
          markOrgReady();
          return;
        }
        markOrgError(toBootstrapOrgError(bootstrapError));
        return;
      }

      if (!isCurrent()) return;

      const bootstrapRole = typeof bootstrapResult.role === 'string' ? bootstrapResult.role : null;
      const bootstrapMembership: MembershipState = {
        orgId: bootstrapResult.org_id,
        role: bootstrapRole,
        canViewTeamLeads: canRoleViewTeamLeads(bootstrapRole),
      };

      rememberLastGoodMembership(nextUser.id, bootstrapMembership);
      setMembershipState(bootstrapMembership);
      markOrgReady();

      void (async () => {
        try {
          const postBootstrap = await resolveMembershipWithRetry(nextUser.id, `${source}:post_bootstrap`);
          if (!isCurrent()) return;

          if (postBootstrap.status === 'membership_encontrada') {
            rememberLastGoodMembership(nextUser.id, postBootstrap.membership);
            setMembershipState(postBootstrap.membership);
            markOrgReady();
            return;
          }

          if (postBootstrap.status === 'erro_transitorio/query') {
            console.warn(`[AuthContext] [${source}] post-bootstrap membership query failed; keeping bootstrap state`, {
              userId: nextUser.id,
              kind: postBootstrap.orgResolutionError.kind,
              status: postBootstrap.orgResolutionError.status,
              code: postBootstrap.orgResolutionError.code,
            });
            return;
          }

          console.warn(`[AuthContext] [${source}] membership still missing after bootstrap`, {
            userId: nextUser.id,
          });
          setMembershipState(EMPTY_MEMBERSHIP);
          markOrgError({
            kind: 'missing_after_bootstrap',
            message: 'Membership ainda ausente após bootstrap_self.',
          });
        } catch (postBootstrapError) {
          if (!isCurrent()) return;
          console.error(`[AuthContext] [${source}] unexpected post-bootstrap reconciliation error`, postBootstrapError);
        }
      })();
    };

    const initAuth = async () => {
      try {
        // Get initial session
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
        }

        await applySessionState(initialSession, 'init');
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        void (async () => {
          await applySessionState(newSession, event);
          if (mounted) {
            setLoading(false);
          }
        })();
      }
    );

    initAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<AuthError | null> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return error;
    } catch (err) {
      console.error('Sign in error:', err);
      return { message: 'Erro ao fazer login', name: 'AuthError', status: 500 } as AuthError;
    }
  };

  const signUp = async (email: string, password: string): Promise<AuthError | null> => {
    try {
      // Use current origin for email redirect (works for all environments)
      const redirectUrl = window.location.origin;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });
      return error;
    } catch (err) {
      console.error('Sign up error:', err);
      return { message: 'Erro ao criar conta', name: 'AuthError', status: 500 } as AuthError;
    }
  };

  const signOut = async () => {
    try {
      lastGoodMembershipRef.current = null;
      activeUserIdRef.current = null;
      setMembershipState(EMPTY_MEMBERSHIP);
      setOrgResolutionStatus('idle');
      setOrgResolutionError(null);
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const value: AuthContextType = {
    user,
    orgId,
    role,
    canViewTeamLeads,
    orgResolutionStatus,
    orgResolutionError,
    session,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
