import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpRight, DollarSign, Gauge, Minus, Timer, Wallet } from "lucide-react";
import { DashboardPayload } from "@/types/dashboard";
import { Skeleton } from "@/components/ui/skeleton";

interface KpiCardsProps {
  data?: DashboardPayload["kpis"];
  isLoading: boolean;
}

export function KpiCards({ data, isLoading }: KpiCardsProps) {
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Card className="border-border/50 bg-background/80 shadow-sm">
          <CardContent className="p-8">
            <Skeleton className="h-5 w-[140px] bg-muted/50" />
            <Skeleton className="mt-4 h-14 w-[200px] bg-muted/50" />
            <Skeleton className="mt-3 h-5 w-[260px] bg-muted/50" />
          </CardContent>
        </Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-border/50 bg-background/50 glass shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium"><Skeleton className="h-4 w-[100px] bg-muted/50" /></CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold"><Skeleton className="h-8 w-[90px] bg-muted/50" /></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatPercent = (value: number | null) => {
    if (value === null) return "--";
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}${Math.abs(value).toFixed(1)}%`;
  };

  const profitDelta = data.profit.delta_pct;
  const revenueDelta = data.revenue.delta_pct;
  const marginValue = data.revenue.value > 0 ? (data.profit.value / data.revenue.value) * 100 : 0;

  const deltaColor = (delta: number | null) =>
    delta === null ? "text-muted-foreground" : delta > 0 ? "text-green-500" : delta < 0 ? "text-red-500" : "text-gray-400";

  const heroTone =
    profitDelta === null
      ? "border-border/50 bg-background/80"
      : profitDelta > 0
        ? "border-emerald-500/20 bg-emerald-500/5"
        : profitDelta < 0
          ? "border-red-500/20 bg-red-500/5"
          : "border-border/50 bg-background/80";

  const HeroIcon = profitDelta === null ? Minus : profitDelta > 0 ? ArrowUpRight : profitDelta < 0 ? ArrowDownIcon : Minus;

  const marginTone =
    marginValue >= 30 ? "text-green-500" : marginValue >= 15 ? "text-amber-500" : "text-red-500";

  const cycleTone =
    data.avg_close_days.value <= 15 ? "text-green-500" : data.avg_close_days.value <= 30 ? "text-amber-500" : "text-red-500";

  const DeltaIcon = ({ delta }: { delta: number | null }) =>
    delta === null
      ? null
      : delta > 0
        ? <ArrowUpIcon className="mr-1 h-4 w-4 text-green-500" />
        : delta < 0
          ? <ArrowDownIcon className="mr-1 h-4 w-4 text-red-500" />
          : null;

  const heroHeadline =
    profitDelta === null
      ? (data.profit.prev_value <= 0 && data.profit.value > 0 ? "Primeiro periodo com lucro" : "Sem base comparavel")
      : profitDelta > 0
        ? "Crescimento acima do periodo anterior"
        : profitDelta < 0
          ? "Lucro abaixo do periodo anterior"
          : "Lucro estavel no periodo";

  return (
    <div className="space-y-4">
      <Card className={`${heroTone} shadow-md transition-shadow`}>
        <CardContent className="flex flex-col gap-6 p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">Lucro Acrescido</p>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/80 shadow-sm">
                <HeroIcon className={`h-6 w-6 ${deltaColor(profitDelta)}`} />
              </div>
              <div className={`text-4xl font-bold tracking-tight sm:text-5xl ${deltaColor(profitDelta)}`}>
                {formatPercent(profitDelta)}
              </div>
            </div>
            <p className="text-base text-muted-foreground">{formatCurrency(data.profit.value)} de lucro realizado no periodo</p>
          </div>

          <div className="space-y-1 text-left lg:text-right">
            <p className="text-sm text-muted-foreground">Leitura principal do negocio</p>
            <p className="text-lg font-semibold text-foreground">{heroHeadline}</p>
            <p className="text-sm text-muted-foreground">Use os indicadores abaixo para entender margem, faturamento, ticket e velocidade de fechamento.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Margem de Lucro</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10"><Gauge className="h-4 w-4 text-primary" /></div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${marginTone}`}>{data.revenue.value > 0 ? `${marginValue.toFixed(1)}%` : "--"}</div>
            <p className="mt-1 text-xs text-muted-foreground">{data.revenue.value > 0 ? (marginValue >= 30 ? "Margem saudavel no periodo" : marginValue >= 15 ? "Margem em atencao" : "Margem pressionada") : "Sem faturamento registrado no periodo"}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10"><Wallet className="h-4 w-4 text-emerald-500" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatPercent(revenueDelta)}</div>
            <p className="mt-1 flex items-center text-xs text-muted-foreground">
              <DeltaIcon delta={revenueDelta} />
              <span className={deltaColor(revenueDelta)}>{formatCurrency(data.revenue.value)}</span>
              <span className="ml-1">{revenueDelta === null && data.revenue.prev_value <= 0 && data.revenue.value > 0 ? "primeiro periodo com faturamento" : "no periodo"}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Medio</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/10"><DollarSign className="h-4 w-4 text-purple-500" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(data.ticket_avg.value)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Valor medio por venda fechada</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ciclo Medio</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10"><Timer className="h-4 w-4 text-amber-500" /></div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.avg_close_days.value > 0 ? cycleTone : "text-foreground"}`}>{data.avg_close_days.value > 0 ? `${Math.round(data.avg_close_days.value)} dias` : "--"}</div>
            <p className="mt-1 text-xs text-muted-foreground">{data.avg_close_days.value > 0 ? "Do lead ao fechamento da venda" : "Sem vendas concluidas no periodo"}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

