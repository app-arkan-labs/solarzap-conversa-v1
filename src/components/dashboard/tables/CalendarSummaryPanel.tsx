import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardPayload } from "@/types/dashboard";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";

interface CalendarSummaryProps {
  data?: DashboardPayload["calendar"];
  isLoading: boolean;
  filter?: "next_7_days" | "last_7_days";
  onFilterChange?: (val: "next_7_days" | "last_7_days") => void;
  onViewAll?: () => void;
  title?: string;
  description?: string;
  actionLabel?: string;
  eventLimit?: number;
  daysAhead?: number;
  showFilter?: boolean;
  listHeightClassName?: string;
}

export function CalendarSummaryPanel({
  data,
  isLoading,
  filter = "next_7_days",
  onFilterChange,
  onViewAll,
  title = "Compromissos",
  description = "O que voce precisa cumprir hoje e nos proximos dias.",
  actionLabel = "Ver agenda",
  eventLimit = 4,
  daysAhead,
  showFilter = false,
  listHeightClassName = "h-[320px]",
}: CalendarSummaryProps) {
  if (isLoading || !data) return null;

  const periodLabel = filter === "next_7_days" ? "Proximos 7 dias" : "Ultimos 7 dias";
  const pendingCount = data.scheduled + data.confirmed;
  const cutoffDate = typeof daysAhead === "number" ? new Date() : null;
  if (cutoffDate) {
    cutoffDate.setHours(23, 59, 59, 999);
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);
  }

  const visibleEvents = data.upcoming
    .filter((event) => {
      if (!cutoffDate) return true;
      const eventDate = new Date(event.start_at);
      return eventDate <= cutoffDate;
    })
    .slice(0, eventLimit);
  const summaryLabel = daysAhead ? `Hoje e proximos ${daysAhead} dias` : periodLabel;

  return (
    <Card className="h-full min-w-0 border-border/50 bg-background/50 shadow-sm">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarIcon className="h-4 w-4" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onViewAll}
              className="text-xs font-medium text-primary hover:underline"
              type="button"
            >
              {actionLabel}
            </button>
            {showFilter && onFilterChange ? (
              <Select value={filter} onValueChange={(value) => onFilterChange(value as "next_7_days" | "last_7_days")}>
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue>{periodLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="next_7_days">Proximos 7 dias</SelectItem>
                  <SelectItem value="last_7_days">Ultimos 7 dias</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Compromissos</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{data.total}</p>
            <p className="text-xs text-muted-foreground">{summaryLabel.toLowerCase()}</p>
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Pendentes</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">Agendados e confirmados</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Realizados</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{data.done}</p>
            <p className="text-xs text-muted-foreground">Compromissos concluidos</p>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">Risco</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{data.no_show + data.canceled}</p>
            <p className="text-xs text-muted-foreground">{data.no_show} no-show e {data.canceled} cancelados</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {visibleEvents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
            Nenhum compromisso encontrado para {summaryLabel.toLowerCase()}.
          </div>
        ) : (
          <ScrollArea className={listHeightClassName}>
            <div className="space-y-3 pr-3">
              {visibleEvents.map((event) => {
                const eventDate = new Date(event.start_at);
                const statusTone =
                  event.status === "done" || event.status === "completed"
                    ? "bg-emerald-500/10 text-emerald-700"
                    : event.status === "canceled"
                      ? "bg-rose-500/10 text-rose-700"
                      : event.status === "no_show"
                        ? "bg-amber-500/10 text-amber-700"
                        : "bg-blue-500/10 text-blue-700";

                return (
                  <div key={event.id} className="rounded-lg border border-border/60 bg-background/70 px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{event.title || "Compromisso"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {event.leads?.nome || "Lead sem nome"} | {event.type || "outro"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                        <span className="text-sm font-medium text-foreground">
                          {format(eventDate, "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase ${statusTone}`}>
                          {event.status === "no_show" ? "no-show" : event.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
