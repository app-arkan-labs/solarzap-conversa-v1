import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPayload } from "@/types/dashboard";
import { ArrowDownRight, ArrowUpRight, TrendingDown } from "lucide-react";

interface LossSummaryCardProps {
  data?: DashboardPayload["loss_summary"];
  isLoading: boolean;
  onOpenDetails: () => void;
}

export function LossSummaryCard({ data, isLoading, onOpenDetails }: LossSummaryCardProps) {
  if (isLoading || !data) return null;

  const delta = data.change_pct;
  const isWorse = (delta || 0) > 0;
  const TrendIcon = isWorse ? ArrowUpRight : ArrowDownRight;
  const trendTone = isWorse ? "text-rose-600" : "text-emerald-600";

  return (
    <Card className="border-border/50 bg-background/50 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-rose-500" />
          Motivos de perda
        </CardTitle>
        <CardDescription>Resumo rapido do que esta derrubando negocios neste periodo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border/60 bg-background/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Negocios perdidos</p>
          <p className="mt-2 text-3xl font-bold text-foreground">{data.total}</p>
          <div className={`mt-2 inline-flex items-center gap-1 text-sm font-medium ${trendTone}`}>
            <TrendIcon className="h-4 w-4" />
            {delta === null
              ? "Sem base comparavel"
              : delta === 0
                ? "Mesmo volume do periodo anterior"
                : `${Math.abs(delta)}% ${isWorse ? "acima" : "abaixo"} do periodo anterior`}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-background/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Principal motivo</p>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {data.top_reason?.label || "Sem perdas registradas"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.top_reason
              ? `${data.top_reason.count} ocorrencias | ${data.top_reason.share}% do total`
              : "Assim que houver perdas registradas, este bloco destaca a principal causa."}
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-background/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Leitura rapida</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.active_reasons > 0
              ? `Atue primeiro nos ${Math.min(3, data.active_reasons)} motivos mais frequentes para reduzir perdas mais rapido.`
              : "Nenhum motivo ativo no periodo selecionado."}
          </p>
        </div>

        <Button className="w-full" variant="outline" onClick={onOpenDetails}>
          Abrir analise detalhada
        </Button>
      </CardContent>
    </Card>
  );
}
