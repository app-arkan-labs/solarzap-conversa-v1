import React, { useMemo } from 'react';
import { AppointmentType, Channel, CHANNEL_INFO, Contact } from '@/types/solarzap';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, X, Search, Check } from 'lucide-react';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export interface CalendarFilterState {
    type?: AppointmentType | 'all';
    channel?: Channel;
    clientId?: string;
    startDate?: Date;
    endDate?: Date;
}

interface CalendarFiltersProps {
    filters: CalendarFilterState;
    onChange: (filters: CalendarFilterState) => void;
    contacts: Contact[];
    className?: string;
}

export function CalendarFilters({ filters, onChange, contacts, className }: CalendarFiltersProps) {
    const availableChannels = useMemo(() => {
        const seen = new Set<Channel>();
        const channels: Channel[] = [];

        contacts.forEach((contact) => {
            const channel = contact.channel;
            if (!seen.has(channel)) {
                seen.add(channel);
                channels.push(channel);
            }
        });

        return channels;
    }, [contacts]);

    const handleTypeChange = (val: string) => {
        onChange({ ...filters, type: val === 'all' ? undefined : val as AppointmentType });
    };

    const handleChannelChange = (val: string) => {
        onChange({ ...filters, channel: val === 'all' ? undefined : val as Channel });
    };

    const handleClientChange = (val: string) => {
        onChange({ ...filters, clientId: val === 'all' ? undefined : val });
    };

    const handleStartDateChange = (date?: Date) => {
        onChange({ ...filters, startDate: date });
    };

    const handleEndDateChange = (date?: Date) => {
        onChange({ ...filters, endDate: date });
    };

    const clearFilters = () => {
        onChange({ type: undefined, channel: undefined, clientId: undefined, startDate: undefined, endDate: undefined });
    };

    const hasFilters = !!filters.type || !!filters.channel || !!filters.clientId || !!filters.startDate || !!filters.endDate;

    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            {/* Filter by Type */}
            <Select value={filters.type || 'all'} onValueChange={handleTypeChange}>
                <SelectTrigger className="w-[150px] h-8 text-xs bg-white text-primary border border-slate-300 shadow-sm hover:bg-white/90 focus:ring-0 focus:ring-offset-0">
                    <SelectValue placeholder="Tipo de Evento" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos os Tipos</SelectItem>
                    <SelectItem value="chamada">Ligação</SelectItem>
                    <SelectItem value="visita">Visita Técnica</SelectItem>
                    <SelectItem value="reuniao">Reunião</SelectItem>
                    <SelectItem value="instalacao">Instalação</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
            </Select>

            {/* Filter by Lead Source */}
            <Select value={filters.channel || 'all'} onValueChange={handleChannelChange}>
                <SelectTrigger className="w-[170px] h-8 text-xs bg-white text-primary border border-slate-300 shadow-sm hover:bg-white/90 focus:ring-0 focus:ring-offset-0">
                    <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todas as Origens</SelectItem>
                    {availableChannels.map((channel) => (
                        <SelectItem key={`calendar-source-${channel}`} value={channel}>
                            {CHANNEL_INFO[channel]?.label || channel}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Client Search (Combobox) */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                            "w-[200px] h-8 justify-between text-xs bg-white text-primary border border-slate-300 shadow-sm hover:bg-white/90 hover:text-primary",
                            !filters.clientId && "text-muted-foreground"
                        )}
                    >
                        {filters.clientId
                            ? contacts.find((c) => c.id === filters.clientId)?.name
                            : "Buscar Cliente..."}
                        <Search className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0">
                    <Command>
                        <CommandInput placeholder="Buscar cliente..." className="h-8 text-xs" />
                        <CommandList>
                            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                            <CommandGroup>
                                <CommandItem
                                    value="all"
                                    onSelect={() => handleClientChange('all')}
                                    className="text-xs"
                                >
                                    Todos os Clientes
                                    <Check
                                        className={cn(
                                            "ml-auto h-3 w-3",
                                            !filters.clientId ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                </CommandItem>
                                {contacts.map((contact) => (
                                    <CommandItem
                                        key={contact.id}
                                        value={contact.name}
                                        onSelect={() => handleClientChange(contact.id)}
                                        className="text-xs"
                                    >
                                        {contact.name}
                                        <Check
                                            className={cn(
                                                "ml-auto h-3 w-3",
                                                filters.clientId === contact.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            {/* Date Range Group - Tighter spacing, White Background optimized */}
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-300 shadow-sm">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant={"ghost"}
                            className={cn(
                                "h-7 px-2 text-left font-normal text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                                !filters.startDate && "text-slate-400"
                            )}
                        >
                            <CalendarIcon className="mr-1.5 h-3 w-3" />
                            {filters.startDate ? format(filters.startDate, "dd/MM/yy") : <span>Início</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar
                            mode="single"
                            selected={filters.startDate}
                            onSelect={handleStartDateChange}
                            initialFocus
                            locale={ptBR}
                        />
                    </PopoverContent>
                </Popover>

                <span className="text-[10px] text-slate-300 mx-1">-</span>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant={"ghost"}
                            className={cn(
                                "h-7 px-2 text-left font-normal text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                                !filters.endDate && "text-slate-400"
                            )}
                        >
                            <CalendarIcon className="mr-1.5 h-3 w-3" />
                            {filters.endDate ? format(filters.endDate, "dd/MM/yy") : <span>Fim</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar
                            mode="single"
                            selected={filters.endDate}
                            onSelect={handleEndDateChange}
                            initialFocus
                            locale={ptBR}
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Clear Button */}
            {hasFilters && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
                    title="Limpar filtros"
                >
                    <X className="h-4 w-4" />
                </Button>
            )}
        </div>
    );
}
