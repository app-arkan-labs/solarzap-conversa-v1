import { Filter, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { InternalCrmClientSummary } from '@/modules/internal-crm/types';
import { cn } from '@/lib/utils';

type CrmCalendarFilterState = {
  type: string;
  status: string;
  clientId: string;
};

type InternalCrmCalendarFiltersProps = {
  filters: CrmCalendarFilterState;
  onFiltersChange: (f: CrmCalendarFilterState) => void;
  clients: InternalCrmClientSummary[];
};

export function InternalCrmCalendarFilters(props: InternalCrmCalendarFiltersProps) {
  const [open, setOpen] = useState(false);
  const { filters, onFiltersChange, clients } = props;
  const hasActive = filters.type !== 'all' || filters.status !== 'all' || filters.clientId !== 'all';

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className={cn(hasActive && 'border-primary text-primary')}
        onClick={() => setOpen(!open)}
      >
        <Filter className="mr-1.5 h-3.5 w-3.5" />
        Filtros
        {hasActive && <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">!</span>}
      </Button>

      {open && (
        <>
          <Select value={filters.type} onValueChange={(v) => onFiltersChange({ ...filters, type: v })}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="call">Ligação</SelectItem>
              <SelectItem value="demo">Demonstração</SelectItem>
              <SelectItem value="meeting">Reunião</SelectItem>
              <SelectItem value="visit">Visita</SelectItem>
              <SelectItem value="other">Outro</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.status} onValueChange={(v) => onFiltersChange({ ...filters, status: v })}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="scheduled">Agendado</SelectItem>
              <SelectItem value="confirmed">Confirmado</SelectItem>
              <SelectItem value="done">Realizado</SelectItem>
              <SelectItem value="canceled">Cancelado</SelectItem>
              <SelectItem value="no_show">Não Compareceu</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.clientId} onValueChange={(v) => onFiltersChange({ ...filters, clientId: v })}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => onFiltersChange({ type: 'all', status: 'all', clientId: 'all' })}
            >
              <X className="mr-1 h-3 w-3" /> Limpar
            </Button>
          )}
        </>
      )}
    </div>
  );
}
