import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import AdminAccessErrorScreen from '@/components/admin/AdminAccessErrorScreen';
import { resolveAdminGuardState } from '@/components/admin/adminGuardState';
import {
  useAdminWhoAmI,
  type AdminWhoAmIResponse,
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
    <div className="auth-shell min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center px-6">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-foreground/80">{label}</p>
      </div>
    </div>
  );
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
  const mfaResolved = Boolean(mfaQuery.data) || mfaQuery.isError;
  const adminError = whoamiQuery.error && isAdminApiError(whoamiQuery.error) ? whoamiQuery.error : null;
  const guardState = resolveAdminGuardState({
    authLoading: loading,
    hasUser: Boolean(user),
    whoamiLoading: whoamiQuery.isLoading || whoamiQuery.isFetching,
    whoamiHasError: whoamiQuery.isError,
    whoamiErrorCode,
    systemRole: whoamiQuery.data?.system_role,
    isAal2,
    mfaResolved,
    mfaLoading: mfaQuery.isLoading || mfaQuery.isFetching,
    mfaError: mfaQuery.isError,
    hasEnrolledFactor,
  });

  useEffect(() => {
    if (!whoamiQuery.error || deniedToastShownRef.current) return;

    const err = whoamiQuery.error;
    if (!isAdminApiError(err)) return;

    if (err.code === 'not_system_admin' || err.code === 'insufficient_role') {
      deniedToastShownRef.current = true;
      toast({
        title: 'Acesso restrito',
        description: 'Seu usuário não possui permissão de system admin para acessar /admin.',
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

  const mfaContextValue = useMemo<AdminGuardContextValue>(() => ({ identity: null }), []);

  const handleRetry = async () => {
    if (requiresMfa || isMfaRoute) {
      await mfaQuery.refetch();
    }
    await whoamiQuery.refetch();
  };

  const errorMessage =
    adminError?.message ||
    (mfaQuery.error instanceof Error && mfaQuery.error.message) ||
    'Falha ao validar acesso ao painel admin.';
  const errorCode =
    adminError?.code ||
    (guardState === 'origin_error' ? 'forbidden_origin' : 'unknown_admin_error');
  const errorStatus = adminError?.status;
  const errorRequestId = adminError?.requestId ?? null;

  if (guardState === 'checking_access') {
    return <LoadingScreen label="Validando sessão..." />;
  }

  if (guardState === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (guardState === 'role_denied') {
    return <Navigate to="/" replace />;
  }

  if (guardState === 'mfa_setup_required') {
    if (!isMfaSetupRoute) {
      return <Navigate to="/admin/mfa-setup" replace />;
    }
    return (
      <AdminGuardContext.Provider value={mfaContextValue}>
        {children}
      </AdminGuardContext.Provider>
    );
  }

  if (guardState === 'mfa_verify_required') {
    if (!isMfaVerifyRoute) {
      return <Navigate to="/admin/mfa-verify" replace />;
    }
    return (
      <AdminGuardContext.Provider value={mfaContextValue}>
        {children}
      </AdminGuardContext.Provider>
    );
  }

  if (guardState === 'session_error' || guardState === 'origin_error' || guardState === 'admin_api_error') {
    return (
      <AdminAccessErrorScreen
        mode={guardState}
        code={errorCode}
        status={errorStatus}
        requestId={errorRequestId}
        message={errorMessage}
        onRetry={handleRetry}
      />
    );
  }

  if (guardState === 'allowed' && isMfaRoute) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <AdminGuardContext.Provider value={contextValue}>
      {children}
    </AdminGuardContext.Provider>
  );
};
