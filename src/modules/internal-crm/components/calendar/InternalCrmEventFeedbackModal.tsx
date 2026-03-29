import { useEffect, useState } from 'react';
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
import { formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmAppointment } from '@/modules/internal-crm/types';

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
    const currentStatus = props.appointment.status;
    if (['done', 'canceled', 'no_show'].includes(currentStatus)) {
      setStatus(currentStatus as InternalCrmAppointment['status']);
    } else {
      setStatus('done');
    }
    setNotes(props.appointment.notes || '');
  }, [props.appointment, props.open]);

  async function handleSave() {
    await props.onSave({ status, notes: notes.trim() });
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar feedback do evento</DialogTitle>
          <DialogDescription>
            {props.appointment
              ? `${props.appointment.title} - ${formatDateTime(props.appointment.start_at)}`
              : 'Atualize o resultado do compromisso.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Resultado</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as InternalCrmAppointment['status'])}>
              <SelectTrigger>
                <SelectValue placeholder="Resultado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="done">Realizado</SelectItem>
                <SelectItem value="no_show">No-show</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Feedback / observacoes</Label>
            <Textarea
              rows={5}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Resumo da reuniao, objeAAes, proximo passo..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={props.isSubmitting}>
            Salvar feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

