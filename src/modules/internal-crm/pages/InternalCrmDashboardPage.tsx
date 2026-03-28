import { BarChart3, Clock3, DollarSign, Handshake, TimerReset, Users } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInternalCrmDashboard } from '@/modules/internal-crm/hooks/useInternalCrmApi';
import { MetricCard, TokenBadge, formatCurrencyBr, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';

export default function InternalCrmDashboardPage() {
  const dashboardQuery = useInternalCrmDashboard();
  const kpis = dashboardQuery.data?.kpis;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Dashboard"
        subtitle="Visao comercial consolidada da operacao interna SolarZap."
        icon={BarChart3}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Leads no periodo" value={String(kpis?.leads_in_period ?? 0)} subtitle="Base nova criada no intervalo atual" />
        <MetricCard title="Leads qualificados" value={String(kpis?.qualified_leads ?? 0)} subtitle="Volume pronto para avancar no funil" accentClassName="text-amber-700" />
        <MetricCard title="Taxa de ganho" value={`${kpis?.win_rate ?? 0}%`} subtitle="Deals ganhos sobre ganhos + perdidos" accentClassName="text-emerald-700" />
        <MetricCard title="MRR vendido" value={formatCurrencyBr(kpis?.mrr_sold_cents ?? 0)} subtitle="Receita recorrente fechada" accentClassName="text-sky-700" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Receita one-time" value={formatCurrencyBr(kpis?.revenue_one_time_closed_cents ?? 0)} subtitle="Mentorias e servicos fechados" />
        <MetricCard title="MRR ativo" value={formatCurrencyBr(kpis?.mrr_active_cents ?? 0)} subtitle="Assinaturas ativas no CRM" />
        <MetricCard title="Onboarding pendente" value={String(kpis?.onboarding_pending ?? 0)} subtitle="Clientes aguardando provisionamento ou setup" accentClassName="text-cyan-700" />
        <MetricCard title="Risco de churn" value={String(kpis?.churn_risk_count ?? 0)} subtitle="Clientes marcados como sensiveis" accentClassName="text-rose-700" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Handshake className="h-4 w-4 text-primary" />
              Deals parados por etapa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Ultima atualizacao</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(kpis?.stalled_deals || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Nenhum deal parado fora do periodo.
                    </TableCell>
                  </TableRow>
                ) : (
                  (kpis?.stalled_deals || []).map((deal) => (
                    <TableRow key={deal.id}>
                      <TableCell className="font-medium">{deal.title}</TableCell>
                      <TableCell><TokenBadge token={deal.stage_code} label={deal.stage_code} /></TableCell>
                      <TableCell>{formatCurrencyBr((deal.one_time_total_cents || 0) + (deal.mrr_cents || 0))}</TableCell>
                      <TableCell>{formatDateTime(deal.updated_at)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="h-4 w-4 text-primary" />
              Proximas acoes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(kpis?.next_actions || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma acao pendente registrada.</p>
            ) : (
              (kpis?.next_actions || []).map((task) => (
                <div key={task.id} className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{task.title}</p>
                    <TokenBadge token={task.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <TimerReset className="h-3.5 w-3.5" />
                    <span>{formatDateTime(task.due_at)}</span>
                  </div>
                  {task.notes ? <p className="mt-2 text-sm text-muted-foreground">{task.notes}</p> : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Qualificacao
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {kpis?.qualified_leads ?? 0} leads qualificados e {kpis?.demos_scheduled ?? 0} demos agendadas.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4 text-primary" />
              Receita
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {formatCurrencyBr(kpis?.revenue_one_time_closed_cents ?? 0)} one-time e {formatCurrencyBr(kpis?.mrr_sold_cents ?? 0)} em MRR vendido.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TimerReset className="h-4 w-4 text-primary" />
              Base ativa
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {kpis?.onboarding_pending ?? 0} clientes em onboarding, {kpis?.churn_risk_count ?? 0} em risco e {kpis?.churned_in_period ?? 0} churnados no periodo.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
