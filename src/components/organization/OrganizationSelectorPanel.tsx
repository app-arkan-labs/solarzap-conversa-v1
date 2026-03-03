import { useMemo } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { UserOrganizationOption } from '@/lib/orgAdminClient';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Proprietario',
  admin: 'Administrador',
  user: 'Vendedor',
  consultant: 'Consultor',
};

type OrganizationSelectorPanelProps = {
  organizations: UserOrganizationOption[];
  orgHint?: string | null;
  submittingOrgId?: string | null;
  onSelectOrganization: (orgId: string) => void;
  onSignOut?: () => void;
  showSignOut?: boolean;
  title?: string;
  description?: string;
  connectLabel?: string;
  rootTestId?: string;
};

export function OrganizationSelectorPanel({
  organizations,
  orgHint,
  submittingOrgId,
  onSelectOrganization,
  onSignOut,
  showSignOut = true,
  title = 'Escolha a empresa para conectar',
  description = 'Seu usuario possui acesso a mais de uma empresa. Selecione o contexto para continuar.',
  connectLabel = 'Conectar nesta empresa',
  rootTestId = 'org-selector-panel',
}: OrganizationSelectorPanelProps) {
  const sortedOrganizations = useMemo(() => {
    if (!orgHint) return organizations;
    return [...organizations].sort((a, b) => {
      const aHint = a.org_id === orgHint ? 1 : 0;
      const bHint = b.org_id === orgHint ? 1 : 0;
      return bHint - aHint;
    });
  }, [organizations, orgHint]);

  return (
    <div data-testid={rootTestId} className="space-y-3">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Building2 className="h-5 w-5 text-green-600" />
          {title}
        </h2>
        <p className="text-sm text-slate-600">{description}</p>
      </div>

      <div className="space-y-3">
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
                onClick={() => onSelectOrganization(organization.org_id)}
                disabled={isSubmitting}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : connectLabel}
              </Button>
            </div>
          );
        })}
      </div>

      {showSignOut ? (
        <div className="pt-2">
          <Button variant="outline" type="button" onClick={onSignOut}>
            Sair
          </Button>
        </div>
      ) : null}
    </div>
  );
}
