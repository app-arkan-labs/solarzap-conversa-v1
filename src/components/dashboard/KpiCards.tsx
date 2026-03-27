import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPayload } from "@/types/dashboard";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BarChart3,
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
            <Skeleton className="h-4 w-40 bg-muted/50" />
            <Skeleton className="mt-4 h-10 w-64 bg-muted/50" />
            <Skeleton className="mt-3 h-4 w-80 bg-muted/50" />
          </CardContent>
        </Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
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
  const profitAvailable = data.profit.available;
  const marginValue = data.margin.value_pct;
  const cycleTone =
    data.avg_close_days.value <= 15 ? "text-emerald-600" : data.avg_close_days.value <= 30 ? "text-amber-600" : "text-rose-600";
  const revenueLabel = data.revenue.basis === "project_paid" ? "Faturamento em Projeto Pago" : "Vendas fechadas no periodo";
  const revenueHelper =
    data.revenue.basis === "project_paid"
      ? "Valor total dos projetos que entraram em Projeto Pago no periodo."
      : "Baseado nas vendas fechadas dentro do periodo.";

  const cards = [
    {
      title: "Leads recebidos",
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
      description: `${data.conversion.won} vendas no periodo`,
      descriptionTone: "text-muted-foreground",
      icon: TrendingUp,
      iconTone: "text-emerald-600",
      iconBg: "bg-emerald-500/10",
    },
    {
      title: "Ticket medio",
      value: formatCurrency(data.ticket_avg.value),
      description: "Valor medio por venda fechada",
      descriptionTone: "text-muted-foreground",
      icon: Wallet,
      iconTone: "text-cyan-600",
      iconBg: "bg-cyan-500/10",
    },
    {
      title: "Tempo de fechamento",
      value: data.avg_close_days.value > 0 ? `${Math.round(data.avg_close_days.value)} dias` : "--",
      description: data.avg_close_days.value > 0 ? "Da entrada ate o fechamento" : "Sem vendas no periodo",
      descriptionTone: data.avg_close_days.value > 0 ? cycleTone : "text-muted-foreground",
      icon: Timer,
      iconTone: "text-rose-600",
      iconBg: "bg-rose-500/10",
    },
  ] as const;

  return (
    <div className="space-y-4">
      <Card className="border-border/50 bg-background/80 shadow-sm">
        <CardContent className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between lg:p-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Resultado do periodo</p>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
                {formatCurrency(data.revenue.value)}
              </p>
              <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${deltaTone(revenueDelta)}`}>
                <DeltaIcon delta={revenueDelta} />
                {formatPercent(revenueDelta)}
              </div>
            </div>
            <p className="text-sm font-medium text-foreground">{revenueLabel}</p>
            <p className="text-sm text-muted-foreground">{revenueHelper}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[420px]">
            <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Em negociacao</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatCurrency(data.forecast.value)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{data.forecast.count} oportunidades abertas</p>
            </div>
            {profitAvailable ? (
              <>
                <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Lucro realizado</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{formatCurrency(data.profit.value)}</p>
                  <p className={`mt-1 text-xs ${deltaTone(profitDelta)}`}>{formatPercent(profitDelta)} vs periodo anterior</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3 sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Margem da venda</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{marginValue !== null ? `${marginValue.toFixed(1)}%` : "--"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.margin.note || "Baseada no valor da venda e no custo informado em Projeto Pago."}
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/70 px-4 py-3 sm:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Lucro realizado</p>
                <p className="mt-1 text-lg font-semibold text-foreground">Sem parcelas confirmadas</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.profit.reason || "O lucro realizado aparece conforme as parcelas do Projeto Pago forem confirmadas."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="border-border/50 bg-background/50 shadow-sm transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
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
