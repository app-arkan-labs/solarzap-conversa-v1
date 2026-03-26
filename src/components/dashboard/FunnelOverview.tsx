import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DashboardPayload } from "@/types/dashboard";
import { AlertTriangle, ArrowRightLeft, CheckCircle2, TrendingDown } from "lucide-react";

interface FunnelOverviewProps {
    data?: DashboardPayload["funnel"];
    isLoading: boolean;
}

export function FunnelOverview({ data, isLoading }: FunnelOverviewProps) {
    if (isLoading || !data) return null;

    const groupedRows = {
        topo: data.by_stage.filter((row) => row.group === "topo"),
        meio: data.by_stage.filter((row) => row.group === "meio"),
        fundo: data.by_stage.filter((row) => row.group === "fundo"),
        saida: data.by_stage.filter((row) => row.group === "saida"),
    } as const;

    const bottleneckLabel = data.top_bottleneck_stage
        ? data.by_stage.find((row) => row.stage === data.top_bottleneck_stage)?.label || "Sem gargalo"
        : "Sem gargalo critico";

    return (
        <Card className="border-border/50 bg-background/50 shadow-sm">
            <CardHeader>
                <CardTitle>Funil atual</CardTitle>
                <CardDescription>
                    Estado atual da carteira ate o fim do periodo selecionado, com destaque para gargalos e entradas por etapa.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {data.by_group.map((group) => (
                        <div key={group.key} className="rounded-xl border border-border/60 bg-background/70 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{group.label}</p>
                            <p className="mt-2 text-2xl font-bold text-foreground">{group.count}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{group.pct.toFixed(1)}% do funil atual</p>
                            {group.stale_count > 0 ? (
                                <p className="mt-2 text-xs text-amber-600">{group.stale_count} acima do SLA</p>
                            ) : (
                                <p className="mt-2 text-xs text-emerald-600">Sem atraso relevante</p>
                            )}
                        </div>
                    ))}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border/60 bg-background/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <ArrowRightLeft className="h-4 w-4 text-sky-600" />
                            Movimentos no periodo
                        </div>
                        <p className="mt-2 text-2xl font-bold text-foreground">{data.moved_in_period}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            Vitorias no periodo
                        </div>
                        <p className="mt-2 text-2xl font-bold text-foreground">{data.won_in_period}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            Gargalo principal
                        </div>
                        <p className="mt-2 text-base font-semibold text-foreground">{bottleneckLabel}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{data.stale_total} leads acima do SLA no total</p>
                    </div>
                </div>

                <div className="space-y-6">
                    {Object.entries(groupedRows).map(([groupKey, rows]) => {
                        if (rows.length === 0) return null;
                        const sectionTitle =
                            groupKey === "topo" ? "Topo" :
                                groupKey === "meio" ? "Meio" :
                                    groupKey === "fundo" ? "Fundo" : "Saidas";

                        return (
                            <div key={groupKey} className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-foreground">{sectionTitle}</p>
                                    <p className="text-xs text-muted-foreground">{rows.reduce((sum, row) => sum + row.count, 0)} leads</p>
                                </div>

                                <div className="space-y-3">
                                    {rows.map((row) => (
                                        <div key={row.stage} className="rounded-xl border border-border/60 bg-background/70 p-4">
                                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-foreground">{row.label}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {row.entered_in_period} entradas no periodo
                                                        {row.sla_days ? ` • SLA ${row.sla_days}d` : ""}
                                                    </p>
                                                </div>
                                                <div className="text-left md:text-right">
                                                    <p className="text-lg font-semibold text-foreground">{row.count}</p>
                                                    <p className="text-xs text-muted-foreground">{row.pct.toFixed(1)}% do funil</p>
                                                </div>
                                            </div>

                                            <Progress value={Math.min(100, row.pct)} className="mt-3 h-2 bg-muted/70" />

                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {row.stale_count > 0 ? (
                                                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-700">
                                                        {row.stale_count} acima do SLA
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700">
                                                        Dentro do SLA
                                                    </Badge>
                                                )}

                                                {row.group === "saida" && row.stage === "perdido" ? (
                                                    <Badge variant="secondary" className="bg-rose-500/10 text-rose-700">
                                                        <TrendingDown className="mr-1 h-3 w-3" />
                                                        {row.count} perdas acumuladas
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
