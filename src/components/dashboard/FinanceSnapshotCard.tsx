import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPayload } from "@/types/dashboard";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CalendarClock, CheckCircle2, Wallet } from "lucide-react";

interface FinanceSnapshotCardProps {
  data?: DashboardPayload["finance"];
  isLoading: boolean;
  maxInstallments?: number;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

const dueBadgeLabel = (dueOn: string, status: "scheduled" | "awaiting_confirmation") => {
  if (status === "awaiting_confirmation") {
    return {
      label: "Confirmar",
      className: "bg-amber-500/10 text-amber-700",
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${dueOn}T00:00:00`);
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: "Vencida",
      className: "bg-rose-500/10 text-rose-700",
    };
  }

  if (diffDays === 0) {
    return {
      label: "Vence hoje",
      className: "bg-amber-500/10 text-amber-700",
    };
  }

  return {
    label: `${diffDays}d`,
    className: "bg-sky-500/10 text-sky-700",
  };
};

export function FinanceSnapshotCard({ data, isLoading, maxInstallments = 6 }: FinanceSnapshotCardProps) {
  if (isLoading || !data) return null;

  const hasAnyFinanceData =
    data.received_in_period > 0 ||
    data.realized_profit_in_period > 0 ||
    data.scheduled_in_period > 0 ||
    data.overdue_count > 0 ||
    data.due_next_7_days_count > 0 ||
    data.upcoming_installments.length > 0;

  const visibleInstallments = data.upcoming_installments.slice(0, maxInstallments);

  return (
    <Card className="border-border/50 bg-background/50 shadow-sm">
      <CardHeader className="space-y-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wallet className="h-4 w-4 text-emerald-600" />
            Financeiro do Projeto Pago
          </CardTitle>
          <CardDescription>O que entrou, o que vence agora e o que ainda pede confirmacao.</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Recebido
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{formatCurrency(data.received_in_period)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Confirmado no periodo selecionado.</p>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Lucro realizado</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{formatCurrency(data.realized_profit_in_period)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Reconhecido nas parcelas pagas.</p>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5 text-sky-600" />
              Previsto no periodo
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{formatCurrency(data.scheduled_in_period)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Parcelas previstas dentro do intervalo.</p>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Proximos 7 dias
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{formatCurrency(data.due_next_7_days_amount)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{data.due_next_7_days_count} parcelas para acompanhar.</p>
          </div>
        </div>

        {data.overdue_count > 0 ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3">
            <p className="text-sm font-semibold text-rose-700">
              {data.overdue_count} parcelas vencidas somando {formatCurrency(data.overdue_amount)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Use este alerta para cobrar ou confirmar pagamento antes de perder controle do caixa.</p>
          </div>
        ) : null}

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Proximas parcelas</p>
            <p className="text-xs text-muted-foreground">Datas de vencimento que merecem sua atencao agora.</p>
          </div>

          {!hasAnyFinanceData ? (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
              Nenhum movimento financeiro de Projeto Pago neste momento.
            </div>
          ) : data.upcoming_installments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
              Nenhuma parcela pendente para exibir agora.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleInstallments.map((installment) => {
                const badge = dueBadgeLabel(installment.due_on, installment.status);
                return (
                  <div key={installment.id} className="rounded-lg border border-border/60 bg-background/70 px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{installment.lead_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Parcela #{installment.installment_no} | vence em {format(new Date(`${installment.due_on}T00:00:00`), "dd/MM", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 sm:justify-end">
                        <span className="text-sm font-semibold text-foreground">{formatCurrency(installment.amount)}</span>
                        <Badge variant="secondary" className={badge.className}>
                          {badge.label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
              {data.upcoming_installments.length > visibleInstallments.length ? (
                <div className="rounded-lg border border-dashed border-border/60 px-4 py-3 text-xs text-muted-foreground">
                  +{data.upcoming_installments.length - visibleInstallments.length} parcelas restantes fora desta amostra.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
