import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAdminOrgDetails } from '@/hooks/useAdminApi';
import OrgActions from '@/components/admin/OrgActions';
import FeatureFlagsPanel from '@/components/admin/FeatureFlagsPanel';

export default function OrgDetails() {
  const params = useParams<{ id: string }>();
  const orgId = params.id ?? null;
  const detailsQuery = useAdminOrgDetails(orgId);
  const org = detailsQuery.data?.org;
  const members = detailsQuery.data?.members ?? [];
  const stats = detailsQuery.data?.stats;

  const planLimitsText = useMemo(() => {
    if (!org?.plan_limits || typeof org.plan_limits !== 'object') {
      return '{}';
    }
    return JSON.stringify(org.plan_limits, null, 2);
  }, [org?.plan_limits]);

  if (!orgId) {
    return <p className="text-sm text-muted-foreground">org_id invalido.</p>;
  }

  if (detailsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando organizacao...</p>;
  }

  if (!org) {
    return <p className="text-sm text-muted-foreground">Organizacao nao encontrada.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Detalhes da Organizacao</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{org.name}</span>
            <Badge variant={org.status === 'suspended' ? 'destructive' : 'outline'}>
              {org.status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          <p>
            <span className="text-muted-foreground">ID:</span> {org.id}
          </p>
          <p>
            <span className="text-muted-foreground">Owner:</span> {org.owner_id || '-'}
          </p>
          <p>
            <span className="text-muted-foreground">Plano:</span> {org.plan}
          </p>
          <p>
            <span className="text-muted-foreground">Criada em:</span> {org.created_at || '-'}
          </p>
          <p className="md:col-span-2">
            <span className="text-muted-foreground">Motivo suspensao:</span>{' '}
            {org.suspension_reason || '-'}
          </p>
          <p className="md:col-span-2">
            <span className="text-muted-foreground">Plan limits:</span>{' '}
            <span className="font-mono text-xs break-all">{planLimitsText}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estatisticas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Membros</p>
            <p className="text-xl font-semibold">{stats?.member_count ?? 0}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Leads</p>
            <p className="text-xl font-semibold">{stats?.lead_count ?? 0}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Propostas</p>
            <p className="text-xl font-semibold">{stats?.proposal_count ?? 0}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Instancias</p>
            <p className="text-xl font-semibold">{stats?.instance_count ?? 0}</p>
          </div>
        </CardContent>
      </Card>

      <OrgActions
        orgId={org.id}
        status={org.status}
        plan={org.plan}
        planLimits={org.plan_limits}
        onUpdated={async () => {
          await detailsQuery.refetch();
        }}
      />

      <FeatureFlagsPanel
        orgId={org.id}
        title="Feature Flags da Organizacao"
        description="Altere overrides por tenant com auditoria obrigatoria."
      />

      <Card>
        <CardHeader>
          <CardTitle>Membros</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Pode ver time</TableHead>
                <TableHead>Ingresso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.user_id}>
                  <TableCell className="font-mono text-xs">{member.user_id}</TableCell>
                  <TableCell>{member.email || '-'}</TableCell>
                  <TableCell>{member.role}</TableCell>
                  <TableCell>{member.can_view_team_leads ? 'Sim' : 'Nao'}</TableCell>
                  <TableCell>{member.joined_at || '-'}</TableCell>
                </TableRow>
              ))}
              {!members.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhum membro encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
