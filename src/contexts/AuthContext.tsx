import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { bootstrapSelf } from '@/lib/orgAdminClient';

interface AuthContextType {
  user: User | null;
  orgId: string | null;
  role: string | null;
  canViewTeamLeads: boolean;
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

const EMPTY_MEMBERSHIP: MembershipState = {
  orgId: null,
  role: null,
  canViewTeamLeads: false,
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
  const [role, setRole] = useState<string | null>(null);
  const [canViewTeamLeads, setCanViewTeamLeads] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const setMembershipState = (membership: MembershipState) => {
    setOrgId(membership.orgId);
    setRole(membership.role);
    setCanViewTeamLeads(membership.canViewTeamLeads);
  };

  const resolveMembership = async (userId: string): Promise<MembershipState> => {
    try {
      const { data, error } = await supabase
        .from('organization_members')
        .select('org_id, role, can_view_team_leads, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .order('org_id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error || !data?.org_id) {
        if (error) {
          console.error('Error loading membership:', error);
        }
        return EMPTY_MEMBERSHIP;
      }

      const resolvedRole = typeof data.role === 'string' ? data.role : null;
      return {
        orgId: data.org_id,
        role: resolvedRole,
        canViewTeamLeads:
          resolvedRole === 'owner' ||
          resolvedRole === 'admin' ||
          data.can_view_team_leads === true,
      };
    } catch (err) {
      console.error('Membership resolution error:', err);
      return EMPTY_MEMBERSHIP;
    }
  };

  useEffect(() => {
    let mounted = true;

    const applySessionState = async (nextSession: Session | null) => {
      if (!mounted) return;

      setSession(nextSession);
      const nextUser = nextSession?.user ?? null;
      setUser(nextUser);

      if (!nextUser) {
        setMembershipState(EMPTY_MEMBERSHIP);
        return;
      }

      let membership = await resolveMembership(nextUser.id);
      if (!membership.orgId) {
        try {
          await bootstrapSelf();
          membership = await resolveMembership(nextUser.id);
        } catch (bootstrapError) {
          console.error('Membership bootstrap error:', bootstrapError);
        }
      }
      if (!mounted) return;
      setMembershipState(membership);
    };

    const initAuth = async () => {
      try {
        // Get initial session
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
        }

        await applySessionState(initialSession);
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
      (_event, newSession) => {
        void (async () => {
          await applySessionState(newSession);
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
      // Use production URL for email redirect, fallback to current origin
      const redirectUrl = window.location.hostname === 'localhost' 
        ? window.location.origin 
        : 'https://solarzap-conversa.lovable.app';
      
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
      setMembershipState(EMPTY_MEMBERSHIP);
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
    session,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
