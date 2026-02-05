import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DashboardPayload } from "@/types/dashboard";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell, PieChart, Pie, Legend, AreaChart, Area, ComposedChart, Line } from "recharts";
import { PIPELINE_STAGES, PipelineStage } from "@/types/solarzap";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Filter } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { getStageColor } from "@/lib/colors";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c', '#d0ed57'];

// Canonical Order of Pipeline Stages
const ORDERED_STAGES: PipelineStage[] = [
    'novo_lead',
    'respondeu',
    'chamada_agendada',
    'chamada_realizada',
    'nao_compareceu',
    'aguardando_proposta',
    'proposta_pronta',
    'visita_agendada',
    'visita_realizada',
    'proposta_negociacao',
    'financiamento',
    'contrato_assinado',
    'projeto_pago',
    'aguardando_instalacao',
    'projeto_instalado',
    'coletar_avaliacao',
    'contato_futuro',
    'perdido'
];

interface ChartProps {
    data?: DashboardPayload["charts"];
    isLoading: boolean;
}

export function DashboardCharts({ data, isLoading }: ChartProps) {
    // State for selected stages in Funnel
    // Default to a sensible subset or all? Let's default to all non-lost/future stages for a clean view initially
    // Or just all. Let's start with specific reliable stages to show a clean funnel.
    const [selectedStages, setSelectedStages] = useState<PipelineStage[]>([
        'novo_lead', 'chamada_agendada', 'visita_agendada', 'proposta_pronta', 'contrato_assinado', 'projeto_instalado'
    ]);

    if (isLoading || !data) return null;

    // --- Data Processing for Funnel ---
    // 1. Map current data to a dictionary for O(1) access
    const countsByStage = data.funnel_counts.reduce((acc, item) => {
        acc[item.stage as PipelineStage] = item.count;
        return acc;
    }, {} as Record<PipelineStage, number>);

    // 2. Build the ordered data based on selection
    const funnelData = ORDERED_STAGES
        .filter(stage => selectedStages.includes(stage))
        .map(stage => ({
            id: stage,
            name: PIPELINE_STAGES[stage]?.title || stage,
            count: countsByStage[stage] || 0 // Use 0 if no leads in this stage
        }));

    // Format monthly data - the hook already formats month labels correctly
    const monthlyData = data.monthly.map(item => ({
        name: item.month,
        leads: item.leads,
        sales: item.sales,
        revenue: item.revenue,
        conversion_rate: item.conversion_rate
    }));

    const toggleStage = (stage: PipelineStage) => {
        setSelectedStages(prev =>
            prev.includes(stage)
                ? prev.filter(s => s !== stage)
                : [...prev, stage]
        );
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Leads by Source */}
                <Card>
                    <CardHeader>
                        <CardTitle>Origem dos Leads</CardTitle>
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
                                    {data.leads_by_source.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Sales by Source */}
                <Card>
                    <CardHeader>
                        <CardTitle>Vendas por Origem</CardTitle>
                        <CardDescription>Canais que mais convertem em vendas</CardDescription>
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
                                    {data.sales_by_source.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Monthly Performance - Full Width */}
            <Card className="mt-4">
                <CardHeader>
                    <CardTitle>Análise de Vendas</CardTitle>
                    <CardDescription>Leads vs Vendas e Taxa de Conversão</CardDescription>
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
                            <Line type="monotone" yAxisId="right" name="Conversão %" dataKey="conversion_rate" stroke="#ff7300" strokeWidth={2} dot={{ r: 4 }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

        </div >
    );
}
