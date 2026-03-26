import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPayload } from "@/types/dashboard";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BarChart3,
  DollarSign,
  Gauge,
  LineChart,
  Timer,
  TrendingUp,
  Wallet,
} from "lucide-react";

interface KpiCardsProps {
  data?: DashboardPayload["kpis"];
  isLoading: boolean;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatPercent = (value: number | null) => {
  if (value === null) return "--";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
};

const deltaTone = (delta: number | null) =>
  delta === null ? "text-muted-foreground" : delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-muted-foreground";

const DeltaIcon = ({ delta }: { delta: number | null }) => {
  if (delta === null || delta === 0) return null;
  return delta > 0 ? <ArrowUpIcon className="h-3.5 w-3.5" /> : <ArrowDownIcon className="h-3.5 w-3.5" />;
};

export function KpiCards({ data, isLoading }: KpiCardsProps) {
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Card className="border-border/50 bg-background/80 shadow-sm">
          <CardContent className="p-6">
            <Skeleton className="h-4 w-32 bg-muted/50" />
            <Skeleton className="mt-4 h-10 w-52 bg-muted/50" />
            <Skeleton className="mt-3 h-4 w-64 bg-muted/50" />
          </CardContent>
        </Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => (
            <Card key={index} className="border-border/50 bg-background/50 shadow-sm">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24 bg-muted/50" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24 bg-muted/50" />
                <Skeleton className="mt-3 h-4 w-28 bg-muted/50" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const revenueDelta = data.revenue.delta_pct;
  const profitDelta = data.profit.delta_pct;
  const marginValue = data.revenue.value > 0 ? (data.profit.value / data.revenue.value) * 100 : 0;
  const marginTone =
    marginValue >= 30 ? "text-emerald-600" : marginValue >= 15 ? "text-amber-600" : "text-rose-600";
  const cycleTone =
    data.avg_close_days.value <= 15 ? "text-emerald-600" : data.avg_close_days.value <= 30 ? "text-amber-600" : "text-rose-600";

  const cards = [
    {
      title: "Leads",
      value: data.leads.value.toLocaleString("pt-BR"),
      description: `${formatPercent(data.leads.delta_pct)} vs periodo anterior`,
      descriptionTone: deltaTone(data.leads.delta_pct),
      icon: BarChart3,
      iconTone: "text-sky-600",
      iconBg: "bg-sky-500/10",
    },
    {
      title: "Conversao",
      value: `${data.conversion.value_pct.toFixed(1)}%`,
      description: `${data.conversion.won} vendas em ${data.conversion.leads} leads`,
      descriptionTone: "text-muted-foreground",
      icon: TrendingUp,
      iconTone: "text-emerald-600",
      iconBg: "bg-emerald-500/10",
    },
    {
      title: "Forecast",
      value: formatCurrency(data.forecast.value),
      description: `${data.forecast.count} oportunidades abertas`,
      descriptionTone: "text-muted-foreground",
      icon: LineChart,
      iconTone: "text-indigo-600",
      iconBg: "bg-indigo-500/10",
    },
    {
      title: "Margem",
      value: data.revenue.value > 0 ? `${marginValue.toFixed(1)}%` : "--",
      description: data.revenue.value > 0 ? "Lucro sobre faturamento" : "Sem faturamento no periodo",
      descriptionTone: data.revenue.value > 0 ? marginTone : "text-muted-foreground",
      icon: Gauge,
      iconTone: "text-amber-600",
      iconBg: "bg-amber-500/10",
    },
    {
      title: "Faturamento",
      value: formatCurrency(data.revenue.value),
      description: `${formatPercent(revenueDelta)} vs periodo anterior`,
      descriptionTone: deltaTone(revenueDelta),
      icon: Wallet,
      iconTone: "text-green-600",
      iconBg: "bg-green-500/10",
    },
    {
      title: "Ticket Medio",
      value: formatCurrency(data.ticket_avg.value),
      description: "Valor medio por venda fechada",
      descriptionTone: "text-muted-foreground",
      icon: DollarSign,
      iconTone: "text-cyan-600",
      iconBg: "bg-cyan-500/10",
    },
    {
      title: "Ciclo Medio",
      value: data.avg_close_days.value > 0 ? `${Math.round(data.avg_close_days.value)} dias` : "--",
      description: data.avg_close_days.value > 0 ? "Do lead ao fechamento" : "Sem vendas no periodo",
      descriptionTone: data.avg_close_days.value > 0 ? cycleTone : "text-muted-foreground",
      icon: Timer,
      iconTone: "text-rose-600",
      iconBg: "bg-rose-500/10",
    },
  ] as const;

  return (
    <div className="space-y-4">
      <Card className="border-border/50 bg-background/80 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Lucro realizado</p>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
                {formatCurrency(data.profit.value)}
              </p>
              <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${deltaTone(profitDelta)}`}>
                <DeltaIcon delta={profitDelta} />
                {formatPercent(profitDelta)}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {profitDelta === null
                ? "Sem base comparavel para lucro neste periodo."
                : "Comparado com o periodo imediatamente anterior."}
            </p>
          </div>

          <div className="max-w-xl">
            <p className="text-sm font-medium text-foreground">Leitura principal do negocio</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Acompanhe abaixo entrada de leads, conversao, previsao de receita, margem, faturamento e velocidade de fechamento.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="border-border/50 bg-background/50 shadow-sm transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                  <CardDescription className="sr-only">{card.title}</CardDescription>
                </div>
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${card.iconBg}`}>
                  <Icon className={`h-4 w-4 ${card.iconTone}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{card.value}</div>
                <p className={`mt-2 text-xs ${card.descriptionTone}`}>{card.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
