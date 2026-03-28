import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPayload } from "@/types/dashboard";
import { RadioTower } from "lucide-react";

interface SourcePerformanceCardProps {
  data?: DashboardPayload["source_performance"];
  revenueBasis?: DashboardPayload["kpis"]["revenue"]["basis"];
  isLoading: boolean;
  limit?: number;
  actionLabel?: string;
  onAction?: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);

export function SourcePerformanceCard({
  data,
  revenueBasis = "won_deals",
  isLoading,
  limit = 4,
  actionLabel,
  onAction,
}: SourcePerformanceCardProps) {
  if (isLoading || !data) return null;

  const rows = data.slice(0, limit);
  const revenueLabel = revenueBasis === "project_paid" ? "faturamento" : "valor fechado";

  return (
    <Card className="h-full border-border/50 bg-background/50 shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <RadioTower className="h-5 w-5 text-sky-600" />
            Resultados por canal
          </CardTitle>
          <CardDescription>Compare volume, vendas e faturamento por origem.</CardDescription>
        </div>
        {actionLabel && onAction ? (
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados de origem no periodo selecionado.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.source} className="rounded-xl border border-border/60 bg-background/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{row.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.leads} leads | {row.won} vendas | {row.conversion_pct.toFixed(1)}% conversao
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{formatCurrency(row.revenue)}</p>
                    <p className="text-xs text-muted-foreground">{row.share_revenue_pct.toFixed(1)}% do {revenueLabel}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
