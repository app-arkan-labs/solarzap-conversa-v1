import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowDownRight, ArrowUpRight, TrendingDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { DashboardMetricGrid, type DashboardMetricItem } from "@/components/dashboard/DashboardMetricGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LossAnalyticsPayload } from "@/hooks/useLossAnalytics";

interface LossAnalyticsPanelProps {
  data?: LossAnalyticsPayload;
  isLoading: boolean;
  error?: unknown;
  onViewPipeline?: () => void;
}

const formatPercent = (value: number | null) => {
  if (value === null) return "Sem base";
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : ""}${value}%`;
};

export function LossAnalyticsPanel({ data, isLoading, error, onViewPipeline }: LossAnalyticsPanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Skeleton className="h-[360px] rounded-2xl" />
          <Skeleton className="h-[360px] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50 text-rose-700 shadow-sm">
        <CardContent className="p-6 text-sm">
          Falha ao carregar os detalhes das perdas. {error instanceof Error ? error.message : "Tente novamente."}
        </CardContent>
      </Card>
    );
  }

  const totalLosses = data?.totalLosses || 0;
  const topReason = data?.topReason || null;
  const reasonCount = data?.chartData.length || 0;
  const trendValue = data?.changePercentage ?? null;
  const isWorse = (trendValue || 0) > 0;
  const TrendIcon = isWorse ? ArrowUpRight : ArrowDownRight;
  const metricItems: DashboardMetricItem[] = [
    {
      id: "loss-total",
      label: "Negocios perdidos",
      value: String(totalLosses),
      description: "Perdas registradas no periodo selecionado.",
      icon: TrendingDown,
      tone: "rose",
    },
    {
      id: "loss-top-reason",
      label: "Principal motivo",
      value: topReason?.label || "Sem perdas",
      description: topReason ? `${topReason.count} registros no periodo.` : "Sem perdas registradas neste recorte.",
      tone: "amber",
    },
    {
      id: "loss-reasons",
      label: "Motivos registrados",
      value: String(reasonCount),
      description: "Quantidade de motivos diferentes registrados.",
      tone: "sky",
    },
    {
      id: "loss-comparison",
      label: "Vs periodo anterior",
      value: formatPercent(trendValue),
      description:
        trendValue === null
          ? "Ainda sem base comparavel."
          : trendValue > 0
            ? "As perdas aumentaram neste periodo."
            : trendValue < 0
              ? "As perdas cairam neste periodo."
              : "Mesmo volume do periodo anterior.",
      tone: trendValue !== null && trendValue > 0 ? "rose" : "emerald",
    },
  ];

  return (
    <div className="space-y-6">
      <DashboardMetricGrid items={metricItems} />

      <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <Card className="border-border/50 bg-background/50 shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Detalhes das perdas</CardTitle>
              <CardDescription>Ranking dos motivos mais frequentes para voce entender onde agir primeiro.</CardDescription>
            </div>
            {onViewPipeline ? (
              <Button variant="outline" size="sm" className="rounded-full" onClick={onViewPipeline}>
                Ver leads
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="h-[340px]">
            {(data?.chartData || []).length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.chartData} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" angle={-18} textAnchor="end" height={60} interval={0} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                  <Tooltip formatter={(value: number) => [`${value} perdas`, "Quantidade"]} />
                  <Bar dataKey="count" fill="#ef4444" radius={[10, 10, 0, 0]} maxBarSize={54} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-center">
                <p className="text-sm font-medium text-foreground">Nenhuma perda registrada no periodo</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Assim que as perdas forem registradas, este grafico passa a mostrar onde a equipe mais esta perdendo negocio.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-background/50 shadow-sm">
          <CardHeader>
            <CardTitle>Onde agir primeiro</CardTitle>
            <CardDescription>Acoes recomendadas com base nos motivos que mais apareceram.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.actionItems || []).length > 0 ? (
              data?.actionItems.map((item) => (
                <div key={item.title} className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                Sem dados suficientes para sugerir acoes neste periodo.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-border/50 bg-background/50 shadow-sm">
          <CardHeader>
            <CardTitle>Motivos registrados</CardTitle>
            <CardDescription>Os motivos com mais impacto no periodo atual.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.chartData || []).length > 0 ? (
              data?.chartData.slice(0, 6).map((item) => (
                <div key={item.key} className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.share}% das perdas do periodo.</p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">{item.count}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                Nenhum motivo registrado ainda neste periodo.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-background/50 shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Historico recente de perdas</CardTitle>
              <CardDescription>Ultimos negocios perdidos com contexto para revisao rapida.</CardDescription>
            </div>
            {onViewPipeline ? (
              <Button variant="outline" size="sm" className="rounded-full" onClick={onViewPipeline}>
                Ver detalhes
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {(data?.recentLosses || []).length > 0 ? (
              <div className="space-y-3">
                {data?.recentLosses.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{entry.leadName}</p>
                        <p className="text-sm text-muted-foreground">{entry.reasonLabel}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {trendValue !== null ? (
                          <span className={`inline-flex items-center gap-1 ${isWorse ? "text-rose-700" : "text-emerald-700"}`}>
                            <TrendIcon className="h-3.5 w-3.5" />
                            {formatPercent(trendValue)}
                          </span>
                        ) : null}
                        <span>{format(parseISO(entry.createdAt), "dd 'de' MMM, HH:mm", { locale: ptBR })}</span>
                      </div>
                    </div>
                    {entry.detail ? <p className="mt-2 text-sm text-muted-foreground">{entry.detail}</p> : null}
                    {entry.author ? <p className="mt-2 text-xs text-muted-foreground">Registrado por {entry.author}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                Nenhuma perda registrada ainda no periodo selecionado.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
