import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DashboardPayload } from "@/types/dashboard";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CalendarSummaryProps {
    data?: DashboardPayload["calendar"];
    isLoading: boolean;
    filter: 'next_7_days' | 'last_7_days';
    onFilterChange: (val: 'next_7_days' | 'last_7_days') => void;
    onViewAll?: () => void;
}

export function CalendarSummaryPanel({ data, isLoading, filter, onFilterChange, onViewAll }: CalendarSummaryProps) {
    if (isLoading || !data) return null;

    const periodLabel = filter === 'next_7_days' ? 'Próximos 7 dias' : 'Últimos 7 dias';

    return (
        <Card className="h-full">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5" />
                        Agenda
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onViewAll}
                            className="text-xs text-primary hover:underline font-medium bg-transparent border-0 cursor-pointer"
                        >
                            Ver Ag. Completa
                        </button>
                        <Select value={filter} onValueChange={(v) => onFilterChange(v as any)}>
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                                <SelectValue>{periodLabel}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="next_7_days">Próximos 7 dias</SelectItem>
                                <SelectItem value="last_7_days">Últimos 7 dias</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <CardDescription>
                    {data.total} eventos em <b>{periodLabel.toLowerCase()}</b>.
                    <span className="ml-2 text-green-600 block sm:inline">{data.done} realizados</span>
                    <span className="ml-2 text-red-600 block sm:inline">{data.canceled} cancelados</span>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4 max-h-[250px] min-h-[100px] overflow-y-auto pr-2 custom-scrollbar">
                    {data.upcoming.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum evento encontrado para {periodLabel.toLowerCase()}.</p>
                    ) : (
                        data.upcoming.map((event) => (
                            <div key={event.id} className="flex items-start justify-between border-b pb-2 last:border-0 h-16 sm:h-auto">
                                <div className="max-w-[70%]">
                                    <p className="font-medium text-sm truncate" title={event.title}>{event.title}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {event.leads?.nome} • {event.type}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-sm font-medium">
                                        {format(new Date(event.start_at), "dd/MM HH:mm", { locale: ptBR })}
                                    </p>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase inline-block mt-1 ${event.status === 'done' || event.status === 'completed' ? 'bg-green-100 text-green-700' :
                                        event.status === 'canceled' || event.status === 'no_show' ? 'bg-red-100 text-red-700' :
                                            'bg-blue-100 text-blue-700'
                                        }`}>
                                        {event.status === 'no_show' ? 'no-show' : event.status}
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
