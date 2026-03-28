import React, { createContext, useContext, useMemo } from 'react';
import { ArrowLeft, Loader2, Lock } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AdminAccessErrorScreen from '@/components/admin/AdminAccessErrorScreen';
import {
  isInternalCrmApiError,
  useInternalCrmWhoAmI,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import type { InternalCrmWhoAmIResponse } from '@/modules/internal-crm/types';

type InternalCrmGuardContextValue = {
  identity: InternalCrmWhoAmIResponse | null;
};

const InternalCrmGuardContext = createContext<InternalCrmGuardContextValue | undefined>(undefined);

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

function InternalCrmAccessDeniedScreen() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-2xl py-10">
      <Card className="border-amber-200">
        <CardHeader>
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Lock className="h-5 w-5" />
          </div>
          <CardTitle>Acesso ao CRM interno indisponivel</CardTitle>
          <CardDescription>
            Seu usuario e admin do sistema, mas ainda nao possui um `crm_role` habilitado para o novo CRM interno.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => navigate('/admin', { replace: true })}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao Admin
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function useInternalCrmGuardContext() {
  const context = useContext(InternalCrmGuardContext);
  if (!context) {
    throw new Error('useInternalCrmGuardContext must be used inside InternalCrmGuard');
  }
  return context;
}

export const InternalCrmGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const whoamiQuery = useInternalCrmWhoAmI();

  const contextValue = useMemo<InternalCrmGuardContextValue>(
    () => ({ identity: whoamiQuery.data ?? null }),
    [whoamiQuery.data],
  );

  if (whoamiQuery.isLoading || whoamiQuery.isFetching) {
    return <LoadingScreen label="Validando acesso ao CRM interno..." />;
  }

  if (whoamiQuery.error && isInternalCrmApiError(whoamiQuery.error)) {
    if (whoamiQuery.error.code === 'mfa_required') {
      return <Navigate to="/admin/mfa-verify" replace />;
    }

    if (whoamiQuery.error.code === 'not_crm_member' || whoamiQuery.error.code === 'insufficient_role') {
      return <InternalCrmAccessDeniedScreen />;
    }

    return (
      <AdminAccessErrorScreen
        mode={whoamiQuery.error.code === 'forbidden_origin' ? 'origin_error' : 'admin_api_error'}
        code={whoamiQuery.error.code}
        status={whoamiQuery.error.status}
        requestId={whoamiQuery.error.requestId ?? null}
        message={whoamiQuery.error.message}
        onRetry={async () => {
          await whoamiQuery.refetch();
        }}
      />
    );
  }

  return (
    <InternalCrmGuardContext.Provider value={contextValue}>
      {children}
    </InternalCrmGuardContext.Provider>
  );
};
