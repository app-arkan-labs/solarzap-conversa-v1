import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownIcon, ArrowUpIcon, DollarSign, Users, Timer, TrendingUp } from "lucide-react";
import { DashboardPayload } from "@/types/dashboard";
import { Skeleton } from "@/components/ui/skeleton";

interface KpiCardsProps {
    data?: DashboardPayload["kpis"];
    isLoading: boolean;
}

export function KpiCards({ data, isLoading }: KpiCardsProps) {
    if (isLoading || !data) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="border-border/50 bg-background/50 glass shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium"><Skeleton className="h-4 w-[100px] bg-muted/50" /></CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold"><Skeleton className="h-8 w-[60px] bg-muted/50" /></div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    const formatPercent = (value: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(value / 100);

    const deltaColor = (delta: number) =>
        delta > 0 ? 'text-green-500' : delta < 0 ? 'text-red-500' : 'text-gray-400';

    const DeltaIcon = ({ delta }: { delta: number }) =>
        delta > 0
            ? <ArrowUpIcon className="mr-1 h-4 w-4 text-green-500" />
            : delta < 0
                ? <ArrowDownIcon className="mr-1 h-4 w-4 text-red-500" />
                : null;

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Row 1: Volume & Efficiency */}
            <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Leads</CardTitle>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-4 w-4 text-primary" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-foreground">{data.leads.value}</div>
                    <p className="text-xs text-muted-foreground flex items-center mt-1">
                        <DeltaIcon delta={data.leads.delta_pct} />
                        <span className={deltaColor(data.leads.delta_pct)}>
                            {Math.abs(data.leads.delta_pct).toFixed(1)}%
                        </span>
                        <span className="ml-1">vs período anterior</span>
                    </p>
                </CardContent>
            </Card>

            <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Conversão</CardTitle>
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-foreground">{data.conversion.value_pct.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {data.conversion.won} fechados de {data.conversion.leads} leads
                    </p>
                </CardContent>
            </Card>

            <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Ciclo Médio</CardTitle>
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <Timer className="h-4 w-4 text-amber-500" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-foreground">{Math.round(data.avg_close_days.value)} dias</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Do lead ao fechamento
                    </p>
                </CardContent>
            </Card>

            {/* Row 2: Financials */}
            <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento</CardTitle>
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-foreground">{formatCurrency(data.revenue.value)}</div>
                    <p className="text-xs text-muted-foreground flex items-center mt-1">
                        <DeltaIcon delta={data.revenue.delta_pct} />
                        <span className={deltaColor(data.revenue.delta_pct)}>
                            {Math.abs(data.revenue.delta_pct).toFixed(1)}%
                        </span>
                        <span className="ml-1">vs anterior</span>
                    </p>
                </CardContent>
            </Card>

            <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Médio</CardTitle>
                    <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                        <DollarSign className="h-4 w-4 text-purple-500" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-foreground">{formatCurrency(data.ticket_avg.value)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Valor médio por venda
                    </p>
                </CardContent>
            </Card>

            <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Em Negociação</CardTitle>
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                        <TrendingUp className="h-4 w-4 text-indigo-500" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-foreground">{formatCurrency(data.forecast?.value || 0)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {data.forecast?.count || 0} oportunidades ativas
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
