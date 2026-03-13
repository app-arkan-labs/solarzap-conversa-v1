import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building2,
    DollarSign,
    TrendingDown,
    TrendingUp,
    Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    useAdminFinancialSummary,
    useAdminSubscriptionPlans,
    useAdminOrgs,
} from '@/hooks/useAdminApi';

const PLAN_COLORS: Record<string, string> = {
    free: 'bg-slate-100 text-slate-700',
    start: 'bg-blue-100 text-blue-700',
    pro: 'bg-purple-100 text-purple-700',
    scale: 'bg-amber-100 text-amber-800',
    unlimited: 'bg-emerald-100 text-emerald-700',
};

function formatCurrency(cents: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(cents / 100);
}

type KpiCardProps = {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ElementType;
    iconColor: string;
    trend?: 'up' | 'down' | 'neutral';
};

function KpiCard({ title, value, subtitle, icon: Icon, iconColor, trend }: KpiCardProps) {
    return (
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
                        <p className="text-2xl font-bold tracking-tight mt-1">{value}</p>
                        {subtitle && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                                {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
                                {subtitle}
                            </p>
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

export default function FinancialPanel() {
    const navigate = useNavigate();
    const financialQuery = useAdminFinancialSummary();
    const plansQuery = useAdminSubscriptionPlans();
    const orgsQuery = useAdminOrgs({ page: 1, per_page: 100 });

    const financial = financialQuery.data?.summary;
    const plans = plansQuery.data?.plans ?? [];
    const allOrgs = orgsQuery.data?.orgs ?? [];

    const planDistribution = useMemo(() => {
        if (!financial?.plan_distribution) return [];
        const total = financial.active_orgs || 1;
        return Object.entries(financial.plan_distribution)
            .sort(([, a], [, b]) => b - a)
            .map(([planKey, count]) => {
                const planDef = plans.find((p) => p.plan_key === planKey);
                return {
                    planKey,
                    label: planDef?.display_name || planKey,
                    count,
                    priceCents: planDef?.price_cents ?? 0,
                    pct: Math.round((count / total) * 100),
                    colorClass: PLAN_COLORS[planKey] || 'bg-slate-100 text-slate-700',
                    monthlyRevenueCents: (planDef?.price_cents ?? 0) * count,
                };
            });
    }, [financial, plans]);

    const payingOrgs = useMemo(
        () => allOrgs.filter((o) => o.plan !== 'free' && o.status === 'active'),
        [allOrgs],
    );

    const isLoading = financialQuery.isLoading || plansQuery.isLoading;

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-12 w-80" />
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
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Painel Financeiro</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Receita, planos e métricas comerciais</p>
            </div>

            {/* KPI Cards */}
            {financial && (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        title="MRR"
                        value={formatCurrency(financial.mrr_cents)}
                        subtitle="Receita Mensal Recorrente"
                        icon={DollarSign}
                        iconColor="bg-gradient-to-br from-emerald-500 to-teal-600"
                        trend="up"
                    />
                    <KpiCard
                        title="ARR"
                        value={formatCurrency(financial.arr_cents)}
                        subtitle="Receita Anual Recorrente"
                        icon={DollarSign}
                        iconColor="bg-gradient-to-br from-blue-500 to-indigo-600"
                        trend="up"
                    />
                    <KpiCard
                        title="Ticket Médio"
                        value={formatCurrency(financial.avg_ticket_cents)}
                        subtitle="por cliente pagante"
                        icon={Users}
                        iconColor="bg-gradient-to-br from-purple-500 to-pink-500"
                    />
                    <KpiCard
                        title="Churn Rate"
                        value={`${financial.churn_rate_percent}%`}
                        subtitle="últimos 30 dias"
                        icon={financial.churn_rate_percent > 5 ? TrendingDown : TrendingUp}
                        iconColor={financial.churn_rate_percent > 5 ? 'bg-gradient-to-br from-red-500 to-red-600' : 'bg-gradient-to-br from-green-500 to-green-600'}
                        trend={financial.churn_rate_percent > 5 ? 'down' : 'up'}
                    />
                </div>
            )}

            {/* Org Status Breakdown */}
            {financial && (
                <div className="grid gap-4 md:grid-cols-4">
                    <Card className="border-0 shadow-sm">
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-3xl font-bold text-emerald-600">{financial.active_orgs}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Ativas</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-3xl font-bold text-blue-600">{financial.paying_orgs}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Pagantes</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-3xl font-bold text-slate-400">{financial.free_orgs}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Gratuitas</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-3xl font-bold text-red-500">{financial.churned_orgs}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Churned</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Plan Breakdown with Revenue */}
            <div className="grid gap-5 lg:grid-cols-2">
                {/* Plan Distribution */}
                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold">Receita por Plano</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {planDistribution.map((entry) => (
                            <div key={entry.planKey} className="space-y-1.5">
                                <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className={`text-xs ${entry.colorClass}`}>
                                            {entry.label}
                                        </Badge>
                                        <span className="text-muted-foreground">{entry.count} orgs</span>
                                    </div>
                                    <span className="font-semibold">{formatCurrency(entry.monthlyRevenueCents)}/mês</span>
                                </div>
                                <Progress value={entry.pct} className="h-2" />
                            </div>
                        ))}
                        {!planDistribution.length && (
                            <p className="text-sm text-muted-foreground">Sem dados de planos.</p>
                        )}
                    </CardContent>
                </Card>

                {/* Plans Catalog */}
                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold">Catálogo de Planos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                                    <TableHead>Plano</TableHead>
                                    <TableHead className="text-right">Preço</TableHead>
                                    <TableHead className="text-right">Ciclo</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {plans.map((plan) => (
                                    <TableRow key={plan.plan_key}>
                                        <TableCell>
                                            <Badge variant="secondary" className={`text-xs ${PLAN_COLORS[plan.plan_key] || ''}`}>
                                                {plan.display_name}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {plan.price_cents === 0 ? 'Grátis' : formatCurrency(plan.price_cents)}
                                        </TableCell>
                                        <TableCell className="text-right text-sm capitalize">{plan.billing_cycle}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={plan.is_active ? 'default' : 'outline'} className={`text-xs ${plan.is_active ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400'}`}>
                                                {plan.is_active ? 'Ativo' : 'Inativo'}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {/* Paying Customers List */}
            <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-base font-semibold">Clientes Pagantes ({payingOrgs.length})</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => navigate('/admin/orgs')}>
                        <Building2 className="h-4 w-4 mr-1.5" />
                        Ver Todas
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                                <TableHead className="pl-5">Organização</TableHead>
                                <TableHead>Plano</TableHead>
                                <TableHead className="text-right">Membros</TableHead>
                                <TableHead className="text-right">Leads</TableHead>
                                <TableHead className="text-right pr-5">Propostas</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {payingOrgs.map((org) => (
                                <TableRow
                                    key={org.id}
                                    className="cursor-pointer hover:bg-slate-50"
                                    onClick={() => navigate(`/admin/orgs/${org.id}`)}
                                >
                                    <TableCell className="pl-5 font-medium">{org.name}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className={`text-xs ${PLAN_COLORS[org.plan] || ''}`}>
                                            {org.plan}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">{org.member_count}</TableCell>
                                    <TableCell className="text-right">{org.lead_count}</TableCell>
                                    <TableCell className="text-right pr-5">{org.proposal_count}</TableCell>
                                </TableRow>
                            ))}
                            {!payingOrgs.length && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                                        Nenhum cliente pagante encontrado.
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
