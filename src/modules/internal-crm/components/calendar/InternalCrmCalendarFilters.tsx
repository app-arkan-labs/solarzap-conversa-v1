import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { InternalCrmClientSummary } from '@/modules/internal-crm/types';

type InternalCrmCalendarFiltersProps = {
  status: string;
  onStatusChange: (value: string) => void;
  clientId: string;
  onClientIdChange: (value: string) => void;
  clients: InternalCrmClientSummary[];
  onCreateAppointment: () => void;
};

export function InternalCrmCalendarFilters(props: InternalCrmCalendarFiltersProps) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border/70 p-4 md:grid-cols-[220px_1fr_auto]">
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={props.status} onValueChange={props.onStatusChange}>
          <SelectTrigger>
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="scheduled">Agendado</SelectItem>
            <SelectItem value="confirmed">Confirmado</SelectItem>
            <SelectItem value="done">Realizado</SelectItem>
            <SelectItem value="canceled">Cancelado</SelectItem>
            <SelectItem value="no_show">No-show</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Cliente</Label>
        <Select value={props.clientId} onValueChange={props.onClientIdChange}>
          <SelectTrigger>
            <SelectValue placeholder="Todos os clientes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {props.clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.company_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-end">
        <Button onClick={props.onCreateAppointment} className="w-full md:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Novo agendamento
        </Button>
      </div>
    </div>
  );
}
