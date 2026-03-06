import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  DollarSign,
  FileText,
  MessageSquare,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useAdminSystemMetrics, useAdminFinancialSummary, useAdminAuditLog } from '@/hooks/useAdminApi';

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-slate-100 text-slate-700',
  starter: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  business: 'bg-amber-100 text-amber-800',
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Grátis',
  starter: 'Starter',
  pro: 'Pro',
  business: 'Business',
};

type MetricCardProps = {
  title: string;
  value: number | string;
  icon: React.ElementType;
  gradient: string;
  iconColor: string;
  subtitle?: string;
};

function MetricCard({ title, value, icon: Icon, gradient, iconColor, subtitle }: MetricCardProps) {
  return (
    <Card className="relative overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow">
      <div className={`absolute inset-0 ${gradient} opacity-[0.04]`} />
      <CardContent className="relative pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-3xl font-bold tracking-tight mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className={`flex items-center justify-center w-11 h-11 rounded-xl ${iconColor} shadow-sm`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function formatTimeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h atrás`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d atrás`;
}

export default function AdminDashboard() {
  const metricsQuery = useAdminSystemMetrics();
  const financialQuery = useAdminFinancialSummary();
  const recentActivityQuery = useAdminAuditLog({ page: 1, per_page: 5 });
  const navigate = useNavigate();

  const metrics = metricsQuery.data?.metrics;
  const financial = financialQuery.data?.summary;
  const recentEntries = recentActivityQuery.data?.entries ?? [];

  const planDistEntries = useMemo(() => {
    if (!financial?.plan_distribution) return [];
    const total = financial.active_orgs || 1;
    return Object.entries(financial.plan_distribution)
      .sort(([, a], [, b]) => b - a)
      .map(([plan, count]) => ({
        plan,
        count,
        label: PLAN_LABELS[plan] || plan,
        pct: Math.round((count / total) * 100),
        colorClass: PLAN_COLORS[plan] || 'bg-slate-100 text-slate-700',
      }));
  }, [financial]);

  const isLoading = metricsQuery.isLoading || financialQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visão geral do SolarZap</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/orgs')}>
            <Building2 className="h-4 w-4 mr-1.5" />
            Ver Organizações
          </Button>
          <Button size="sm" onClick={() => navigate('/admin/financeiro')} className="bg-emerald-600 hover:bg-emerald-700">
            <DollarSign className="h-4 w-4 mr-1.5" />
            Financeiro
          </Button>
        </div>
      </div>

      {/* ── System Metrics ── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Organizações"
          value={metrics?.total_orgs ?? 0}
          icon={Building2}
          gradient="bg-blue-500"
          iconColor="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <MetricCard
          title="Usuários"
          value={metrics?.total_users ?? 0}
          icon={Users}
          gradient="bg-violet-500"
          iconColor="bg-gradient-to-br from-violet-500 to-violet-600"
        />
        <MetricCard
          title="Leads"
          value={metrics?.total_leads ?? 0}
          icon={Zap}
          gradient="bg-amber-500"
          iconColor="bg-gradient-to-br from-amber-500 to-orange-500"
        />
        <MetricCard
          title="Propostas"
          value={metrics?.total_proposals ?? 0}
          icon={FileText}
          gradient="bg-emerald-500"
          iconColor="bg-gradient-to-br from-emerald-500 to-emerald-600"
        />
        <MetricCard
          title="WhatsApp Ativas"
          value={metrics?.active_instances ?? 0}
          icon={MessageSquare}
          gradient="bg-green-500"
          iconColor="bg-gradient-to-br from-green-500 to-green-600"
        />
      </div>

      {/* ── Financial Quick View ── */}
      {financial && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="MRR"
            value={formatCurrency(financial.mrr_cents)}
            icon={DollarSign}
            gradient="bg-emerald-500"
            iconColor="bg-gradient-to-br from-emerald-500 to-teal-600"
            subtitle="Receita Mensal Recorrente"
          />
          <MetricCard
            title="Clientes Pagantes"
            value={financial.paying_orgs}
            icon={TrendingUp}
            gradient="bg-blue-500"
            iconColor="bg-gradient-to-br from-blue-500 to-indigo-600"
            subtitle={`de ${financial.active_orgs} ativos`}
          />
          <MetricCard
            title="Ticket Médio"
            value={formatCurrency(financial.avg_ticket_cents)}
            icon={DollarSign}
            gradient="bg-purple-500"
            iconColor="bg-gradient-to-br from-purple-500 to-pink-500"
            subtitle="por cliente pagante"
          />
          <MetricCard
            title="Churn Rate"
            value={`${financial.churn_rate_percent}%`}
            icon={TrendingUp}
            gradient="bg-red-500"
            iconColor={financial.churn_rate_percent > 5 ? 'bg-gradient-to-br from-red-500 to-red-600' : 'bg-gradient-to-br from-green-500 to-green-600'}
            subtitle="últimos 30 dias"
          />
        </div>
      )}

      {/* ── Bottom Row ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Plan Distribution */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Distribuição por Plano</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {planDistEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados de planos.</p>
            ) : (
              planDistEntries.map((entry) => (
                <div key={entry.plan} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={`text-xs ${entry.colorClass}`}>
                        {entry.label}
                      </Badge>
                      <span className="text-muted-foreground">{entry.count} orgs</span>
                    </div>
                    <span className="font-medium">{entry.pct}%</span>
                  </div>
                  <Progress value={entry.pct} className="h-2" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Atividade Recente</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('/admin/audit')}>
              Ver tudo
            </Button>
          </CardHeader>
          <CardContent>
            {recentEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma atividade recente.</p>
            ) : (
              <div className="space-y-3">
                {recentEntries.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{entry.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.target_type} · {entry.reason || 'sem motivo'}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTimeAgo(entry.ts)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
