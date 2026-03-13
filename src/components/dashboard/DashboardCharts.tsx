import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DashboardPayload } from "@/types/dashboard";
import { ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Line, Area } from "recharts";

interface ChartProps {
    data?: DashboardPayload["charts"];
    isLoading: boolean;
}

const formatCurrency = (value: number): string =>
    new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
    }).format(value || 0);

export function DashboardCharts({ data, isLoading }: ChartProps) {
    if (isLoading || !data) return null;

    const monthlyData = data.monthly.map((item) => ({
        name: item.month,
        leads: item.leads,
        sales: item.sales,
        revenue: item.revenue,
        profit: item.profit,
        conversion_rate: item.conversion_rate,
    }));

    const hasFinancialData = monthlyData.some((item) => item.revenue > 0 || item.profit > 0);

    return (
        <div className="mt-4">
            <Card className="border-border/50 bg-background/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-foreground">Financeiro realizado</CardTitle>
                    <CardDescription>Recebimentos e lucro reconhecidos por data de pagamento</CardDescription>
                </CardHeader>
                <CardContent className="h-[360px]">
                    {hasFinancialData ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={monthlyData} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.03} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} dy={8} />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    width={96}
                                    tickFormatter={(value) => formatCurrency(Number(value)).replace(',00', '')}
                                />
                                <Tooltip
                                    formatter={(value: number, name: string) => [formatCurrency(Number(value)), name === 'revenue' ? 'Faturamento' : 'Lucro']}
                                    labelFormatter={(label) => `Período: ${label}`}
                                />
                                <Area type="monotone" dataKey="revenue" name="revenue" stroke="#10b981" strokeWidth={2} fill="url(#revenueFill)" />
                                <Line type="monotone" dataKey="profit" name="profit" stroke="#0f766e" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/40 text-center">
                            <p className="text-sm font-medium text-foreground">Sem dados financeiros no período</p>
                            <p className="mt-1 text-sm text-muted-foreground">Ajuste o período ou aguarde novos recebimentos para visualizar a tendência.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}