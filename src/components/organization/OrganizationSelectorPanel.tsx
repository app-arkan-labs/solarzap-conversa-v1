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
    <div data-testid={rootTestId} className="space-y-5 px-7 pb-5 pt-7 sm:px-9 sm:pt-8">
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Building2 className="h-5 w-5 text-primary" />
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="max-h-[min(56vh,30rem)] space-y-4 overflow-y-auto pr-3">
        {sortedOrganizations.map((organization) => {
          const isSubmitting = submittingOrgId === organization.org_id;
          return (
            <div
              key={organization.org_id}
              data-testid={`org-option-${organization.org_id}`}
              className="rounded-3xl border border-border/80 bg-card/96 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.24)] dark:shadow-[0_18px_42px_-34px_rgba(2,6,23,0.6)]"
            >
              <div className="space-y-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{organization.display_name}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{ROLE_LABELS[organization.role] || organization.role}</Badge>
                  {orgHint === organization.org_id ? (
                    <Badge variant="outline" className="border-primary/30 text-primary">
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
                className="brand-gradient-button"
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
