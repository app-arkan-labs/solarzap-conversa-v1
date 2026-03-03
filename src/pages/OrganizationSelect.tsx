import { useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Building2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Proprietario',
  admin: 'Administrador',
  user: 'Vendedor',
  consultant: 'Consultor',
};

export default function OrganizationSelect() {
  const { user, loading, organizations, hasMultipleOrganizations, selectOrganization, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [submittingOrgId, setSubmittingOrgId] = useState<string | null>(null);

  const source = useMemo(() => new URLSearchParams(location.search).get('source'), [location.search]);
  const orgHint = useMemo(() => new URLSearchParams(location.search).get('org_hint'), [location.search]);
  const shouldReloadAfterSelect = source === 'menu';
  const sortedOrganizations = useMemo(() => {
    if (!orgHint) return organizations;
    return [...organizations].sort((a, b) => {
      const aHint = a.org_id === orgHint ? 1 : 0;
      const bHint = b.org_id === orgHint ? 1 : 0;
      return bHint - aHint;
    });
  }, [organizations, orgHint]);

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
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Building2 className="h-5 w-5 text-green-600" />
              Escolha a empresa para conectar
            </CardTitle>
            <CardDescription>
              Seu usuario possui acesso a mais de uma empresa. Selecione o contexto para continuar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sortedOrganizations.map((organization) => {
              const isSubmitting = submittingOrgId === organization.org_id;
              return (
                <div
                  key={organization.org_id}
                  data-testid={`org-option-${organization.org_id}`}
                  className="rounded-lg border border-green-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{organization.display_name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{ROLE_LABELS[organization.role] || organization.role}</Badge>
                      {orgHint === organization.org_id ? (
                        <Badge variant="outline" className="border-green-500 text-green-700">
                          Convite
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    data-testid={`org-select-button-${organization.org_id}`}
                    onClick={() => void handleSelectOrganization(organization.org_id)}
                    disabled={isSubmitting}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Conectar nesta empresa'}
                  </Button>
                </div>
              );
            })}
            <div className="pt-3">
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  void signOut();
                }}
              >
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
