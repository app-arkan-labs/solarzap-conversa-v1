import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DashboardPayload } from "@/types/dashboard";
import { ResponsiveContainer, XAxis, YAxis, Tooltip, Cell, PieChart, Pie, Legend, ComposedChart, Line, Area } from "recharts";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d", "#ffc658", "#8dd1e1", "#a4de6c", "#d0ed57"];

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

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                    <CardTitle className="text-foreground">Origem dos Leads</CardTitle>
                    <CardDescription>Volume de leads por canal</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data.leads_by_source}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={65}
                                fill="#8884d8"
                                dataKey="count"
                                nameKey="source"
                            >
                                {data.leads_by_source.map((_, index) => (
                                    <Cell key={`leads-source-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                    <CardTitle className="text-foreground">Vendas por origem</CardTitle>
                    <CardDescription>Canais que mais geram vendas</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data.sales_by_source}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={65}
                                fill="#82ca9d"
                                dataKey="count"
                                nameKey="source"
                            >
                                {data.sales_by_source.map((_, index) => (
                                    <Cell key={`sales-source-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="lg:col-span-2 border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                    <CardTitle className="text-foreground">Analise de vendas</CardTitle>
                    <CardDescription>Leads, vendas e taxa de conversao no periodo</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="name" />
                            <YAxis yAxisId="left" />
                            <YAxis yAxisId="right" orientation="right" unit="%" />
                            <Tooltip />
                            <Legend />
                            <Area type="monotone" yAxisId="left" name="Leads" dataKey="leads" stroke="#8884d8" fillOpacity={1} fill="url(#colorLeads)" />
                            <Area type="monotone" yAxisId="left" name="Vendas" dataKey="sales" stroke="#82ca9d" fillOpacity={1} fill="url(#colorSales)" />
                            <Line type="monotone" yAxisId="right" name="Conversao %" dataKey="conversion_rate" stroke="#ff7300" strokeWidth={2} dot={{ r: 4 }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="lg:col-span-2 border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                    <CardTitle className="text-foreground">Financeiro realizado</CardTitle>
                    <CardDescription>Recebimentos e lucro reconhecidos por data de pagamento</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <XAxis dataKey="name" />
                            <YAxis tickFormatter={(value) => formatCurrency(Number(value)).replace(',00', '')} width={90} />
                            <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                            <Legend />
                            <Area type="monotone" name="Faturamento" dataKey="revenue" stroke="#16a34a" fill="#16a34a33" />
                            <Line type="monotone" name="Lucro" dataKey="profit" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}