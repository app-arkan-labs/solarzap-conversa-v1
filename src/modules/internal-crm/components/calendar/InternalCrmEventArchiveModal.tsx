import { useMemo, useState } from 'react';
import { Archive, Calendar, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { InternalCrmAppointment } from '@/modules/internal-crm/types';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  call: 'Ligação', demo: 'Demonstração', meeting: 'Reunião', visit: 'Visita', other: 'Outro',
};
const TYPE_COLORS: Record<string, string> = {
  call: 'bg-blue-500', demo: 'bg-indigo-500', meeting: 'bg-purple-500', visit: 'bg-orange-500', other: 'bg-gray-500',
};
const STATUS_LABELS: Record<string, string> = {
  done: 'Realizado', canceled: 'Cancelado', no_show: 'Não Compareceu',
};
const STATUS_COLORS: Record<string, string> = {
  done: 'bg-muted text-foreground/80', canceled: 'bg-red-100 text-red-700', no_show: 'bg-orange-100 text-orange-700',
};

function fmtDate(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '--' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  appointments: InternalCrmAppointment[];
  onEdit: (a: InternalCrmAppointment) => void;
};

export function InternalCrmEventArchiveModal({ open, onOpenChange, appointments, onEdit }: Props) {
  const [typeFilter, setTypeFilter] = useState('all');

  const archived = useMemo(() => {
    return appointments
      .filter((a) => ['done', 'canceled', 'no_show'].includes(a.status))
      .filter((a) => typeFilter === 'all' || a.appointment_type === typeFilter)
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());
  }, [appointments, typeFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4" /> Arquivo de Eventos
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(TYPE_LABELS).map(([k, l]) => (
                <SelectItem key={k} value={k}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{archived.length} evento(s)</span>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {archived.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum evento arquivado.</p>
          ) : (
            <div className="space-y-2 pb-4">
              {archived.map((evt) => (
                <div
                  key={evt.id}
                  className="group relative cursor-pointer rounded-xl border p-3 hover:border-primary/50 hover:shadow-sm"
                  onClick={() => { onEdit(evt); onOpenChange(false); }}
                >
                  <div className={cn('absolute left-0 top-3 bottom-3 w-1 rounded-full', TYPE_COLORS[evt.appointment_type] || 'bg-gray-400')} />
                  <div className="pl-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary/80 uppercase">{TYPE_LABELS[evt.appointment_type] || evt.appointment_type}</span>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[evt.status] || 'bg-muted')}>
                        {STATUS_LABELS[evt.status] || evt.status}
                      </span>
                    </div>
                    <p className="font-semibold text-sm">{evt.title}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(evt.start_at)}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(evt.start_at)}</span>
                      {evt.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{evt.location}</span>}
                    </div>
                    {evt.notes && <p className="text-xs text-muted-foreground line-clamp-2">{evt.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
