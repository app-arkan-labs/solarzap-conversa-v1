import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  useAdminWhoAmI,
  type AdminWhoAmIResponse,
  type SystemRole,
  isAdminApiError,
} from '@/hooks/useAdminApi';

type AdminGuardContextValue = {
  identity: AdminWhoAmIResponse | null;
};

const AdminGuardContext = createContext<AdminGuardContextValue | undefined>(undefined);

type MfaStatus = {
  currentLevel: string;
  hasEnrolledFactor: boolean;
};

async function resolveMfaStatus(): Promise<MfaStatus> {
  const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) {
    throw aalError;
  }

  const currentLevel = aalData?.currentLevel ?? 'aal1';
  const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) {
    throw factorsError;
  }

  const factorsPayload = factorsData as Record<string, unknown> | null;
  const allFactors = Array.isArray(factorsPayload?.all) ? factorsPayload.all : [];
  const totpFactors = Array.isArray(factorsPayload?.totp) ? factorsPayload.totp : [];
  const phoneFactors = Array.isArray(factorsPayload?.phone) ? factorsPayload.phone : [];
  const enrolledCount = allFactors.length + totpFactors.length + phoneFactors.length;

  return {
    currentLevel,
    hasEnrolledFactor: enrolledCount > 0,
  };
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50">
      <div className="flex flex-col items-center gap-3 text-center px-6">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        <p className="text-green-700">{label}</p>
      </div>
    </div>
  );
}

function isBlockedRole(role: SystemRole | undefined): boolean {
  return !role;
}

export function useAdminGuardContext() {
  const context = useContext(AdminGuardContext);
  if (!context) {
    throw new Error('useAdminGuardContext must be used inside AdminGuard');
  }
  return context;
}

export const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const deniedToastShownRef = useRef(false);
  const mfaErrorToastShownRef = useRef(false);
  const mfaRecoveredRef = useRef(false);

  const isMfaSetupRoute = location.pathname === '/admin/mfa-setup';
  const isMfaVerifyRoute = location.pathname === '/admin/mfa-verify';
  const isMfaRoute = isMfaSetupRoute || isMfaVerifyRoute;

  const whoamiQuery = useAdminWhoAmI({
    enabled: Boolean(user) && !loading,
  });

  const whoamiErrorCode =
    whoamiQuery.error && isAdminApiError(whoamiQuery.error) ? whoamiQuery.error.code : undefined;
  const requiresMfa = whoamiErrorCode === 'mfa_required';

  const mfaQuery = useQuery({
    queryKey: ['admin', 'mfa-status', user?.id ?? null],
    queryFn: resolveMfaStatus,
    enabled: Boolean(user) && !loading && (requiresMfa || isMfaRoute),
    staleTime: 5_000,
  });

  const isAal2 = mfaQuery.data?.currentLevel === 'aal2';
  const hasEnrolledFactor = mfaQuery.data?.hasEnrolledFactor === true;

  useEffect(() => {
    if (!mfaQuery.error || mfaErrorToastShownRef.current) return;
    mfaErrorToastShownRef.current = true;
    toast({
      title: 'Falha no gate MFA',
      description: 'Nao foi possivel validar o nivel de autenticacao MFA para o painel admin.',
      variant: 'destructive',
    });
  }, [mfaQuery.error, toast]);

  useEffect(() => {
    if (!whoamiQuery.error || deniedToastShownRef.current) return;

    const err = whoamiQuery.error;
    if (!isAdminApiError(err)) return;

    if (err.code === 'not_system_admin' || err.code === 'insufficient_role') {
      deniedToastShownRef.current = true;
      toast({
        title: 'Acesso restrito',
        description: 'Seu usuario nao possui permissao de system admin para acessar /admin.',
        variant: 'destructive',
      });
    }
  }, [whoamiQuery.error, toast]);

  useEffect(() => {
    if (!requiresMfa) {
      mfaRecoveredRef.current = false;
      return;
    }

    if (!isAal2 || mfaRecoveredRef.current) return;
    mfaRecoveredRef.current = true;
    void whoamiQuery.refetch();
  }, [requiresMfa, isAal2, whoamiQuery.refetch]);

  const contextValue = useMemo<AdminGuardContextValue>(
    () => ({
      identity: whoamiQuery.data ?? null,
    }),
    [whoamiQuery.data],
  );

  if (loading) {
    return <LoadingScreen label="Validando sessao..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (whoamiQuery.isLoading || whoamiQuery.isFetching) {
    return <LoadingScreen label="Validando acesso admin..." />;
  }

  if (whoamiQuery.isError) {
    const err = whoamiQuery.error;
    if (isAdminApiError(err) && (err.code === 'not_system_admin' || err.code === 'insufficient_role')) {
      return <Navigate to="/" replace />;
    }

    if (isAdminApiError(err) && err.code === 'mfa_required') {
      if (mfaQuery.isLoading || mfaQuery.isFetching) {
        return <LoadingScreen label="Validando MFA..." />;
      }

      if (mfaQuery.isError) {
        return <Navigate to="/" replace />;
      }

      if (!isAal2) {
        if (!hasEnrolledFactor) {
          if (!isMfaSetupRoute) {
            return <Navigate to="/admin/mfa-setup" replace />;
          }
          return (
            <AdminGuardContext.Provider value={{ identity: null }}>
              {children}
            </AdminGuardContext.Provider>
          );
        }

        if (!isMfaVerifyRoute) {
          return <Navigate to="/admin/mfa-verify" replace />;
        }

        return (
          <AdminGuardContext.Provider value={{ identity: null }}>
            {children}
          </AdminGuardContext.Provider>
        );
      }
    }

    return <Navigate to="/" replace />;
  }

  if (isMfaRoute) {
    return <Navigate to="/admin" replace />;
  }

  if (isBlockedRole(whoamiQuery.data?.system_role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <AdminGuardContext.Provider value={contextValue}>
      {children}
    </AdminGuardContext.Provider>
  );
};
