import { useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { OrganizationSelectorPanel } from '@/components/organization/OrganizationSelectorPanel';
import { useToast } from '@/hooks/use-toast';

export default function OrganizationSelect() {
  const { user, loading, organizations, hasMultipleOrganizations, selectOrganization, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [submittingOrgId, setSubmittingOrgId] = useState<string | null>(null);

  const source = useMemo(() => new URLSearchParams(location.search).get('source'), [location.search]);
  const orgHint = useMemo(() => new URLSearchParams(location.search).get('org_hint'), [location.search]);
  const shouldReloadAfterSelect = source === 'menu';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          <p className="text-green-700">Carregando empresas...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!hasMultipleOrganizations) {
    return <Navigate to="/" replace />;
  }

  const handleSelectOrganization = async (orgId: string) => {
    try {
      setSubmittingOrgId(orgId);
      await selectOrganization(orgId, { reload: shouldReloadAfterSelect });
      if (!shouldReloadAfterSelect) {
        navigate('/', { replace: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao selecionar organizacao.';
      toast({
        title: 'Erro ao trocar empresa',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSubmittingOrgId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-4 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <Card data-testid="org-select-page" className="border-green-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">Selecao de empresa</CardTitle>
            <CardDescription>Selecione o contexto para continuar.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizationSelectorPanel
              rootTestId="org-selector-page-panel"
              organizations={organizations}
              orgHint={orgHint}
              submittingOrgId={submittingOrgId}
              onSelectOrganization={(orgId) => {
                void handleSelectOrganization(orgId);
              }}
              onSignOut={() => {
                void signOut();
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
