import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Calendar, Mail, Shield, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminOrgDetails } from '@/hooks/useAdminApi';
import OrgActions from '@/components/admin/OrgActions';
import FeatureFlagsPanel from '@/components/admin/FeatureFlagsPanel';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativa', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  suspended: { label: 'Suspensa', className: 'bg-red-100 text-red-700 border-red-200' },
  churned: { label: 'Churned', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const PLAN_CONFIG: Record<string, { label: string; className: string }> = {
  free: { label: 'Grátis', className: 'bg-slate-50 text-slate-600 border-slate-200' },
  start: { label: 'Start', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  starter: { label: 'Starter', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  pro: { label: 'Pro', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  scale: { label: 'Scale', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  business: { label: 'Business', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  unlimited: { label: 'Ilimitado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-white p-4 text-center">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function PlanLimitsList({ limits }: { limits: Record<string, unknown> | null }) {
  if (!limits || Object.keys(limits).length === 0) {
    return <p className="text-sm text-muted-foreground">Sem limites definidos</p>;
  }

  const LABEL_MAP: Record<string, string> = {
    max_members: 'Membros',
    max_leads: 'Leads',
    max_proposals_month: 'Propostas/mês',
    max_whatsapp_instances: 'Instâncias WhatsApp',
    monthly_broadcast_credits: 'Créditos de disparo/mês',
    max_campaigns_month: 'Campanhas de disparo/mês',
    max_broadcasts_month: 'Broadcasts/mês',
    max_proposal_themes: 'Temas de proposta',
    max_automations_month: 'Automações/mês',
    included_ai_requests_month: 'Requests IA/mês',
    ai_enabled: 'IA habilitada',
    google_integration_enabled: 'Google integrado',
    appointments_enabled: 'Agendamentos',
    advanced_reports_enabled: 'Relatórios avançados',
    advanced_tracking_enabled: 'Tracking avançado',
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {Object.entries(limits).map(([key, val]) => {
        const label = LABEL_MAP[key] || key;
        let display: string;
        if (typeof val === 'boolean') {
          display = val ? '✅ Sim' : '❌ Não';
        } else if (val === -1) {
          display = 'Ilimitado';
        } else {
          display = String(val);
        }
        return (
          <div key={key} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{display}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function OrgDetails() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orgId = params.id ?? null;
  const detailsQuery = useAdminOrgDetails(orgId);
  const org = detailsQuery.data?.org;
  const members = detailsQuery.data?.members ?? [];
  const stats = detailsQuery.data?.stats;

  if (!orgId) {
    return <p className="text-sm text-muted-foreground">org_id inválido.</p>;
  }

  if (detailsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!org) {
    return <p className="text-sm text-muted-foreground">Organização não encontrada.</p>;
  }

  const statusConfig = STATUS_CONFIG[org.status] || STATUS_CONFIG.active;
  const planConfig = PLAN_CONFIG[org.plan] || PLAN_CONFIG.free;

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" className="mt-0.5" onClick={() => navigate('/admin/orgs')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 truncate">{org.name}</h1>
            <Badge variant="outline" className={`border ${statusConfig.className}`}>
              {statusConfig.label}
            </Badge>
            <Badge variant="outline" className={`border ${planConfig.className}`}>
              {planConfig.label}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Shield className="h-3.5 w-3.5" />
              {org.id.slice(0, 12)}...
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Criada em {formatDate(org.created_at)}
            </span>
            {org.suspension_reason && (
              <span className="text-red-600 font-medium">
                Motivo: {org.suspension_reason}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label="Membros" value={stats?.member_count ?? 0} />
        <StatBox label="Leads" value={stats?.lead_count ?? 0} />
        <StatBox label="Propostas" value={stats?.proposal_count ?? 0} />
        <StatBox label="Instâncias WhatsApp" value={stats?.instance_count ?? 0} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="members">Membros ({members.length})</TabsTrigger>
          <TabsTrigger value="actions">Ações</TabsTrigger>
          <TabsTrigger value="flags">Feature Flags</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Informações da Organização</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Owner ID</span>
                  <span className="font-mono text-xs">{org.owner_id || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plano</span>
                  <Badge variant="outline" className={`border ${planConfig.className}`}>{planConfig.label}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline" className={`border ${statusConfig.className}`}>{statusConfig.label}</Badge>
                </div>
                {org.suspended_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Suspensa em</span>
                    <span>{formatDate(org.suspended_at)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Limites do Plano</CardTitle>
              </CardHeader>
              <CardContent>
                <PlanLimitsList limits={org.plan_limits} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                    <TableHead className="pl-5">Usuário</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Pode ver time</TableHead>
                    <TableHead className="pr-5">Ingresso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.user_id}>
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                            <Users className="h-3.5 w-3.5 text-slate-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{member.display_name || 'Sem nome'}</p>
                            <p className="text-xs text-muted-foreground font-mono">{member.user_id.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{member.email || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{member.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.can_view_team_leads ? 'default' : 'outline'} className="text-xs">
                          {member.can_view_team_leads ? 'Sim' : 'Não'}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-5 text-sm text-muted-foreground">
                        {formatDate(member.joined_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!members.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        Nenhum membro encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Actions Tab */}
        <TabsContent value="actions">
          <OrgActions
            orgId={org.id}
            status={org.status}
            plan={org.plan}
            planLimits={org.plan_limits}
            onUpdated={async () => {
              await detailsQuery.refetch();
            }}
          />
        </TabsContent>

        {/* Feature Flags Tab */}
        <TabsContent value="flags">
          <FeatureFlagsPanel
            orgId={org.id}
            title="Feature Flags da Organização"
            description="Altere overrides por tenant com auditoria obrigatória."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
