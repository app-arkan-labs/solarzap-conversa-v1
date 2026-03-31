import { useEffect, useState } from 'react';
import { Calendar, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { InternalCrmAppointment } from '@/modules/internal-crm/types';

const TYPE_LABELS: Record<string, string> = {
  call: 'Ligação', demo: 'Demonstração', meeting: 'Reunião', visit: 'Visita', other: 'Outro',
};

function fmtDate(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

type InternalCrmEventFeedbackModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: InternalCrmAppointment | null;
  isSubmitting: boolean;
  onSave: (payload: { status: InternalCrmAppointment['status']; notes: string }) => Promise<void>;
};

export function InternalCrmEventFeedbackModal(props: InternalCrmEventFeedbackModalProps) {
  const [status, setStatus] = useState<InternalCrmAppointment['status']>('done');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!props.open || !props.appointment) return;
    const cs = props.appointment.status;
    if (['done', 'canceled', 'no_show'].includes(cs)) {
      setStatus(cs as InternalCrmAppointment['status']);
    } else {
      setStatus('done');
    }
    setNotes(props.appointment.notes || '');
  }, [props.appointment, props.open]);

  async function handleSave() {
    await props.onSave({ status, notes: notes.trim() });
  }

  const apt = props.appointment;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Feedback</DialogTitle>
          <DialogDescription>Atualize o resultado deste compromisso.</DialogDescription>
        </DialogHeader>

        {apt && (
          <div className="rounded-xl bg-muted/50 p-4 space-y-2">
            <p className="font-semibold text-sm">{apt.title}</p>
            <p className="text-xs text-muted-foreground">{TYPE_LABELS[apt.appointment_type] || apt.appointment_type}</p>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{fmtDate(apt.start_at)}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtTime(apt.start_at)}</span>
              {apt.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{apt.location}</span>}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Resultado</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as InternalCrmAppointment['status'])}>
              <SelectTrigger><SelectValue placeholder="Resultado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="done">Realizado</SelectItem>
                <SelectItem value="no_show">Não Compareceu</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Descreva o resultado da reunião, pontos importantes ou próximos passos..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.isSubmitting}>Cancelar</Button>
          <Button onClick={() => void handleSave()} disabled={props.isSubmitting}>Salvar feedback</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

