import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardPayload } from "@/types/dashboard";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";

interface CalendarSummaryProps {
    data?: DashboardPayload["calendar"];
    isLoading: boolean;
    filter: 'next_7_days' | 'last_7_days';
    onFilterChange: (val: 'next_7_days' | 'last_7_days') => void;
    onViewAll?: () => void;
}

export function CalendarSummaryPanel({ data, isLoading, filter, onFilterChange, onViewAll }: CalendarSummaryProps) {
    if (isLoading || !data) return null;

    const periodLabel = filter === "next_7_days" ? "Proximos 7 dias" : "Ultimos 7 dias";
    const pendingCount = data.scheduled + data.confirmed;

    return (
        <Card className="h-full border-border/50 bg-background/50 shadow-sm">
            <CardHeader>
                <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5" />
                        Agenda Comercial
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onViewAll}
                            className="text-xs font-medium text-primary hover:underline"
                            type="button"
                        >
                            Ver Agenda
                        </button>
                        <Select value={filter} onValueChange={(value) => onFilterChange(value as 'next_7_days' | 'last_7_days')}>
                            <SelectTrigger className="h-8 w-[150px] text-xs">
                                <SelectValue>{periodLabel}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="next_7_days">Proximos 7 dias</SelectItem>
                                <SelectItem value="last_7_days">Ultimos 7 dias</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <CardDescription>
                    {data.total} eventos em <b>{periodLabel.toLowerCase()}</b>.
                    <span className="ml-2 block text-green-600 sm:inline">{data.done} realizados</span>
                    <span className="ml-2 block text-blue-600 sm:inline">{pendingCount} pendentes</span>
                    <span className="ml-2 block text-amber-600 sm:inline">{data.no_show} no-show</span>
                    <span className="ml-2 block text-red-600 sm:inline">{data.canceled} cancelados</span>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4 pr-2">
                    {data.upcoming.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Nenhum evento encontrado para {periodLabel.toLowerCase()}.
                        </p>
                    ) : (
                        data.upcoming.map((event) => (
                            <div key={event.id} className="flex items-start justify-between border-b border-border/50 pb-2 last:border-0">
                                <div className="max-w-[70%]">
                                    <p className="truncate text-sm font-medium text-foreground" title={event.title}>
                                        {event.title}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {event.leads?.nome || "Lead sem nome"} • {event.type}
                                    </p>
                                </div>
                                <div className="shrink-0 text-right">
                                    <p className="text-sm font-medium">
                                        {format(new Date(event.start_at), "dd/MM HH:mm", { locale: ptBR })}
                                    </p>
                                    <span
                                        className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] uppercase ${
                                            event.status === "done" || event.status === "completed"
                                                ? "bg-green-100 text-green-700"
                                                : event.status === "canceled"
                                                    ? "bg-red-100 text-red-700"
                                                    : event.status === "no_show"
                                                        ? "bg-amber-100 text-amber-700"
                                                        : "bg-blue-100 text-blue-700"
                                        }`}
                                    >
                                        {event.status === "no_show" ? "no-show" : event.status}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
