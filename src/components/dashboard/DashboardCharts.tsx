import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPayload } from "@/types/dashboard";
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

interface ChartProps {
    data?: DashboardPayload["charts"];
    kpis?: DashboardPayload["kpis"];
    isLoading: boolean;
    mode?: "all" | "commercial" | "financial";
}

const formatCurrency = (value: number): string =>
    new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
    }).format(value || 0);

export function DashboardCharts({ data, kpis, isLoading, mode = "all" }: ChartProps) {
    if (isLoading || !data) return null;

    const profitAvailable = kpis?.profit.available ?? false;
    const revenueBasis = kpis?.revenue.basis ?? "won_deals";
    const revenueTitle = revenueBasis === "project_paid" ? "Faturamento e lucro realizado" : "Valor fechado por venda";
    const revenueDescription =
        revenueBasis === "project_paid"
            ? "Faturamento entra em Projeto Pago. Lucro realizado entra conforme as parcelas sao confirmadas."
            : "Valores fechados por data da venda, sem misturar lucro realizado.";

    const monthlyData = data.monthly.map((item) => ({
        name: item.month,
        leads: item.leads,
        sales: item.sales,
        revenue: item.revenue,
        profit: item.profit,
        conversion_rate: Number(item.conversion_rate.toFixed(1)),
    }));

    const hasCommercialData = monthlyData.some((item) => item.leads > 0 || item.sales > 0);
    const hasFinancialData = monthlyData.some((item) => item.revenue > 0 || (profitAvailable && item.profit > 0));

    return (
        <div className={`grid gap-6 ${mode === "all" ? "xl:grid-cols-2" : ""}`}>
            {mode !== "financial" ? (
            <Card className="border-border/50 bg-background/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-foreground">Evolucao comercial</CardTitle>
                    <CardDescription>Leads, vendas e conversao ao longo do periodo selecionado.</CardDescription>
                </CardHeader>
                <CardContent className="h-[340px]">
                    {hasCommercialData ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={monthlyData} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} dy={8} />
                                <YAxis yAxisId="volume" allowDecimals={false} axisLine={false} tickLine={false} width={40} />
                                <YAxis
                                    yAxisId="conversion"
                                    orientation="right"
                                    axisLine={false}
                                    tickLine={false}
                                    width={46}
                                    tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                                />
                                <Tooltip
                                    formatter={(value: number, name: string) => {
                                        if (name === "conversion_rate") return [`${Number(value).toFixed(1)}%`, "Conversao"];
                                        if (name === "sales") return [Number(value), "Vendas"];
                                        return [Number(value), "Leads"];
                                    }}
                                    labelFormatter={(label) => `Periodo: ${label}`}
                                />
                                <Legend
                                    formatter={(value) => {
                                        if (value === "leads") return "Leads";
                                        if (value === "sales") return "Vendas";
                                        return "Conversao";
                                    }}
                                />
                                <Line yAxisId="volume" type="monotone" dataKey="leads" stroke="#0284c7" strokeWidth={3} dot={false} />
                                <Line yAxisId="volume" type="monotone" dataKey="sales" stroke="#f59e0b" strokeWidth={3} dot={false} />
                                <Line yAxisId="conversion" type="monotone" dataKey="conversion_rate" stroke="#0f766e" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/40 text-center">
                            <p className="text-sm font-medium text-foreground">Sem movimento comercial no periodo</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Ajuste o periodo para visualizar a entrada de leads, vendas e conversao.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
            ) : null}

            {mode !== "commercial" ? (
            <Card className="border-border/50 bg-background/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-foreground">{revenueTitle}</CardTitle>
                    <CardDescription>{revenueDescription}</CardDescription>
                </CardHeader>
                <CardContent className="h-[340px]">
                    {hasFinancialData ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={monthlyData} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#16a34a" stopOpacity={0.28} />
                                        <stop offset="95%" stopColor="#16a34a" stopOpacity={0.03} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} dy={8} />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    width={96}
                                    tickFormatter={(value) => formatCurrency(Number(value)).replace(",00", "")}
                                />
                                <Tooltip
                                    formatter={(value: number, name: string) => [
                                        formatCurrency(Number(value)),
                                        name === "revenue"
                                            ? revenueBasis === "project_paid"
                                                ? "Faturamento"
                                                : "Valor fechado"
                                            : "Lucro",
                                    ]}
                                    labelFormatter={(label) => `Periodo: ${label}`}
                                />
                                <Legend
                                    formatter={(value) =>
                                        value === "revenue"
                                            ? revenueBasis === "project_paid"
                                                ? "Faturamento"
                                                : "Valor fechado"
                                            : "Lucro realizado"
                                    }
                                />
                                <Area type="monotone" dataKey="revenue" name="revenue" stroke="#16a34a" strokeWidth={2} fill="url(#revenueFill)" />
                                {profitAvailable ? (
                                    <Line type="monotone" dataKey="profit" name="profit" stroke="#15803d" strokeWidth={3} dot={false} />
                                ) : null}
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/40 text-center">
                            <p className="text-sm font-medium text-foreground">Sem dados financeiros no periodo</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                O grafico fica ativo assim que houver valores reconhecidos no intervalo.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
            ) : null}
        </div>
    );
}
