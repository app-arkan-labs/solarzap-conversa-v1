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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { InternalCrmAppointment, InternalCrmClientSummary } from '@/modules/internal-crm/types';

type InternalCrmAppointmentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: InternalCrmAppointment | null;
  clients: InternalCrmClientSummary[];
  defaultStartAt: string | null;
  isSubmitting: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
};

function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function defaultEndFromStart(startAtIso: string): string {
  const startDate = new Date(startAtIso);
  if (Number.isNaN(startDate.getTime())) return '';
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  return toDateTimeLocalValue(endDate.toISOString());
}

type AppointmentDraft = {
  client_id: string;
  deal_id: string;
  owner_user_id: string;
  title: string;
  appointment_type: InternalCrmAppointment['appointment_type'];
  status: InternalCrmAppointment['status'];
  start_at: string;
  end_at: string;
  location: string;
  notes: string;
};

export function InternalCrmAppointmentModal(props: InternalCrmAppointmentModalProps) {
  const [draft, setDraft] = useState<AppointmentDraft>({
    client_id: '',
    deal_id: '',
    owner_user_id: '',
    title: '',
    appointment_type: 'meeting',
    status: 'scheduled',
    start_at: '',
    end_at: '',
    location: '',
    notes: '',
  });

  useEffect(() => {
    if (!props.open) return;

    if (props.appointment) {
      setDraft({
        client_id: props.appointment.client_id,
        deal_id: props.appointment.deal_id || '',
        owner_user_id: props.appointment.owner_user_id || '',
        title: props.appointment.title,
        appointment_type: props.appointment.appointment_type,
        status: props.appointment.status,
        start_at: toDateTimeLocalValue(props.appointment.start_at),
        end_at: toDateTimeLocalValue(props.appointment.end_at),
        location: props.appointment.location || '',
        notes: props.appointment.notes || '',
      });
      return;
    }

    const defaultStart = props.defaultStartAt || new Date().toISOString();
    setDraft({
      client_id: '',
      deal_id: '',
      owner_user_id: '',
      title: '',
      appointment_type: 'meeting',
      status: 'scheduled',
      start_at: toDateTimeLocalValue(defaultStart),
      end_at: defaultEndFromStart(defaultStart),
      location: '',
      notes: '',
    });
  }, [props.appointment, props.defaultStartAt, props.open]);

  const canSave = draft.client_id.length > 0 && draft.title.trim().length > 2 && draft.start_at.length > 0;

  async function handleSave() {
    const startDate = new Date(draft.start_at);
    const endDate = draft.end_at ? new Date(draft.end_at) : null;

    if (Number.isNaN(startDate.getTime())) return;
    if (endDate && Number.isNaN(endDate.getTime())) return;

    await props.onSave({
      appointment_id: props.appointment?.id,
      client_id: draft.client_id,
      deal_id: draft.deal_id || null,
      owner_user_id: draft.owner_user_id || null,
      title: draft.title.trim(),
      appointment_type: draft.appointment_type,
      status: draft.status,
      start_at: startDate.toISOString(),
      end_at: endDate ? endDate.toISOString() : null,
      location: draft.location.trim() || null,
      notes: draft.notes.trim() || null,
    });
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{props.appointment ? 'Editar compromisso' : 'Novo compromisso'}</DialogTitle>
          <DialogDescription>
            Registre demos, calls e reunioes para manter o funil comercial organizado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select
              value={draft.client_id || 'none'}
              onValueChange={(value) => setDraft((current) => ({ ...current, client_id: value === 'none' ? '' : value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Selecione</SelectItem>
                {props.clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Titulo</Label>
            <Input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Demo de produto com diretor comercial"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={draft.appointment_type}
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, appointment_type: value as InternalCrmAppointment['appointment_type'] }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="demo">Demo</SelectItem>
                  <SelectItem value="meeting">Reuniao</SelectItem>
                  <SelectItem value="visit">Visita</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={draft.status}
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, status: value as InternalCrmAppointment['status'] }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Agendado</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="done">Realizado</SelectItem>
                  <SelectItem value="canceled">Cancelado</SelectItem>
                  <SelectItem value="no_show">No-show</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Deal (opcional)</Label>
              <Input
                value={draft.deal_id}
                onChange={(event) => setDraft((current) => ({ ...current, deal_id: event.target.value }))}
                placeholder="ID do deal"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Inicio</Label>
              <Input
                type="datetime-local"
                value={draft.start_at}
                onChange={(event) => setDraft((current) => ({ ...current, start_at: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input
                type="datetime-local"
                value={draft.end_at}
                onChange={(event) => setDraft((current) => ({ ...current, end_at: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Local / link</Label>
            <Input
              value={draft.location}
              onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))}
              placeholder="Google Meet / telefone / endereco"
            />
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              rows={4}
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSave || props.isSubmitting}>
            Salvar compromisso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
