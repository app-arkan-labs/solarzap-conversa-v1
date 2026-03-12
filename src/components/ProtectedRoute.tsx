import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { type OrgRole } from '@/lib/orgAdminClient';
import { Button } from '@/components/ui/button';
import OrgSuspendedScreen from '@/components/admin/OrgSuspendedScreen';
import { useOrgBillingInfo } from '@/hooks/useOrgBilling';
import BillingSetupWizard from '@/components/billing/BillingSetupWizard';
import { BillingBlockerProvider } from '@/contexts/BillingBlockerContext';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';
import SubscriptionRequiredScreen from '@/components/billing/SubscriptionRequiredScreen';
import { isUnlimitedBillingBypass } from '@/lib/billingBlocker';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: OrgRole[];
}

const ORG_ERROR_TITLE_BY_KIND = {
  forbidden_rls: 'Falha de permissao ao carregar organizacao',
  bootstrap_failed: 'Falha ao recuperar organizacao',
  missing_after_bootstrap: 'Organizacao nao encontrada apos bootstrap',
  transient: 'Falha ao carregar organizacao',
} as const;

const ORG_ERROR_DESCRIPTION_BY_KIND = {
  forbidden_rls:
    'Sua sessao esta ativa, mas a leitura do vinculo da organizacao foi bloqueada por permissao/RLS. Verifique a policy de self-select em organization_members.',
  bootstrap_failed:
    'Sua sessao esta ativa, mas a funcao org-admin (bootstrap_self) falhou ao recuperar o contexto da organizacao.',
  missing_after_bootstrap:
    'A funcao de bootstrap respondeu, mas o vinculo da organizacao permaneceu ausente na reconciliacao. Verifique organization_members e logs da org-admin.',
  transient:
    'Sua sessao esta ativa, mas nao foi possivel carregar o contexto da organizacao. Isso pode acontecer por uma falha temporaria de conexao.',
} as const;

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRoles }) => {
  const { user, loading, role, orgId, orgStatus, suspensionReason, signOut, orgResolutionStatus, orgResolutionError, organizations } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const billingQuery = useOrgBillingInfo(Boolean(user && orgId));
  const onboardingQuery = useOnboardingProgress(Boolean(user && orgId));
  const hasShownAccessToastRef = useRef(false);

  const missingRequiredRole =
    !!requiredRoles &&
    requiredRoles.length > 0 &&
    (!role || !requiredRoles.includes(role as OrgRole));

  useEffect(() => {
    if (loading || !user || !orgId) {
      return;
    }

    if (missingRequiredRole && !hasShownAccessToastRef.current) {
      toast({
        title: 'Acesso restrito',
        description: 'Apenas owner/admin podem acessar esta pagina.',
        variant: 'destructive',
      });
      hasShownAccessToastRef.current = true;
      return;
    }

    if (!missingRequiredRole) {
      hasShownAccessToastRef.current = false;
    }
  }, [loading, user, orgId, missingRequiredRole, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          <p className="text-green-700">Verificando autenticacao...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (orgResolutionStatus === 'selection_required') {
    if (organizations.length > 1) {
      return <Navigate to="/select-organization" replace />;
    }
    return <BillingSetupWizard />;
  }

  if (!orgId) {
    if (orgResolutionStatus !== 'error') return <BillingSetupWizard />;

    const errorKind = orgResolutionError?.kind ?? 'transient';
    const errorTitle = ORG_ERROR_TITLE_BY_KIND[errorKind];
    const errorDescription = ORG_ERROR_DESCRIPTION_BY_KIND[errorKind];
    const debugSummary = [
      orgResolutionError?.kind ? `kind=${orgResolutionError.kind}` : null,
      typeof orgResolutionError?.status === 'number' ? `status=${orgResolutionError.status}` : null,
      orgResolutionError?.code ? `code=${orgResolutionError.code}` : null,
      orgResolutionError?.requestId ? `request_id=${orgResolutionError.requestId}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50 px-6">
        <div className="w-full max-w-md rounded-xl border border-green-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <Loader2 className="w-5 h-5 text-amber-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-slate-900">{errorTitle}</h2>
              <p className="text-sm text-slate-600">{errorDescription}</p>
              {orgResolutionError?.message && (
                <p className="text-xs text-slate-500 break-words">{orgResolutionError.message}</p>
              )}
              {import.meta.env.DEV && debugSummary && (
                <p className="text-xs text-slate-500 break-words">{debugSummary}</p>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => window.location.reload()}
              className="bg-green-600 hover:bg-green-700"
            >
              Recarregar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void signOut();
              }}
            >
              Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (orgStatus === 'suspended') {
    return <OrgSuspendedScreen reason={suspensionReason} />;
  }

  const accessState = billingQuery.data?.access_state;
  const subscriptionStatus = String(billingQuery.data?.subscription_status || '').toLowerCase();
  const isUnlimited = isUnlimitedBillingBypass(billingQuery.data);
  const isBillingRoute = location.pathname === '/pricing' || location.pathname === '/billing';
  const isOnboardingRoute = location.pathname === '/onboarding';
  if (!billingQuery.isLoading && !isUnlimited && subscriptionStatus === 'pending_checkout' && !isBillingRoute) {
    return <BillingSetupWizard />;
  }

  if (!billingQuery.isLoading && !isUnlimited && accessState === 'blocked' && !isBillingRoute) {
    return <SubscriptionRequiredScreen />;
  }

  const hasBillingAccess =
    !billingQuery.isLoading &&
    (isUnlimited || (subscriptionStatus !== 'pending_checkout' && accessState !== 'blocked'));

  if (hasBillingAccess && !isOnboardingRoute && !onboardingQuery.isLoading) {
    if (onboardingQuery.data && onboardingQuery.data.is_complete !== true) {
      return <Navigate to="/onboarding" replace />;
    }
  }

  if (missingRequiredRole) {
    return <Navigate to="/" replace />;
  }

  return <BillingBlockerProvider billing={billingQuery.data}>{children}</BillingBlockerProvider>;
};
