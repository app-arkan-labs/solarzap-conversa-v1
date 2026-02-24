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
                    <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium"><Skeleton className="h-4 w-[100px]" /></CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold"><Skeleton className="h-8 w-[60px]" /></div>
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
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{data.leads.value}</div>
                    <p className="text-xs text-muted-foreground flex items-center mt-1">
                        <DeltaIcon delta={data.leads.delta_pct} />
                        <span className={deltaColor(data.leads.delta_pct)}>
                            {Math.abs(data.leads.delta_pct).toFixed(1)}%
                        </span>
                        <span className="ml-1">vs período anterior</span>
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{data.conversion.value_pct.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {data.conversion.won} fechados de {data.conversion.leads} leads
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ciclo Médio</CardTitle>
                    <Timer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{Math.round(data.avg_close_days.value)} dias</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Do lead ao fechamento
                    </p>
                </CardContent>
            </Card>

            {/* Row 2: Financials */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Faturamento</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(data.revenue.value)}</div>
                    <p className="text-xs text-muted-foreground flex items-center mt-1">
                        <DeltaIcon delta={data.revenue.delta_pct} />
                        <span className={deltaColor(data.revenue.delta_pct)}>
                            {Math.abs(data.revenue.delta_pct).toFixed(1)}%
                        </span>
                        <span className="ml-1">vs anterior</span>
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(data.ticket_avg.value)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Valor médio por venda
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Em Negociação</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(data.forecast?.value || 0)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {data.forecast?.count || 0} oportunidades ativas
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
