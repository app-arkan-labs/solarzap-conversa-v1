import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { InternalCrmAppointment, InternalCrmClientSummary } from '@/modules/internal-crm/types';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  call: 'Ligação',
  demo: 'Demonstração',
  meeting: 'Reunião',
  visit: 'Visita',
  other: 'Outro',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  done: 'Realizado',
  canceled: 'Cancelado',
  no_show: 'Não Compareceu',
};

const DURATION_PRESETS = [
  { label: '30 min', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '1h30', minutes: 90 },
  { label: '2h', minutes: 120 },
];

type InternalCrmAppointmentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: InternalCrmAppointment | null;
  clients: InternalCrmClientSummary[];
  defaultStartAt: string | null;
  defaults?: {
    client_id?: string | null;
    deal_id?: string | null;
    title?: string | null;
    appointment_type?: string | null;
    status?: string | null;
    location?: string | null;
    notes?: string | null;
  } | null;
  isSubmitting: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onDelete?: (appointmentId: string) => Promise<void>;
};

function toDateValue(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toTimeValue(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function minutesBetween(start: string, end: string): number | null {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  return Math.round((e.getTime() - s.getTime()) / 60000);
}

type AppointmentDraft = {
  client_id: string;
  title: string;
  appointment_type: string;
  status: string;
  date: string;
  time: string;
  duration_minutes: number;
  location: string;
  notes: string;
};

export function InternalCrmAppointmentModal(props: InternalCrmAppointmentModalProps) {
  const [draft, setDraft] = useState<AppointmentDraft>({
    client_id: '',
    title: '',
    appointment_type: 'meeting',
    status: 'scheduled',
    date: '',
    time: '10:00',
    duration_minutes: 60,
    location: '',
    notes: '',
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!props.open) return;

    if (props.appointment) {
      const dur = minutesBetween(props.appointment.start_at, props.appointment.end_at || '') ?? 60;
      setDraft({
        client_id: props.appointment.client_id,
        title: props.appointment.title,
        appointment_type: props.appointment.appointment_type,
        status: props.appointment.status,
        date: toDateValue(props.appointment.start_at),
        time: toTimeValue(props.appointment.start_at),
        duration_minutes: dur > 0 ? dur : 60,
        location: props.appointment.location || '',
        notes: props.appointment.notes || '',
      });
      return;
    }

    const defaultStart = props.defaultStartAt || new Date().toISOString();
    const defaults = props.defaults || null;
    setDraft({
      client_id: defaults?.client_id || '',
      title: defaults?.title || '',
      appointment_type: defaults?.appointment_type || 'meeting',
      status: defaults?.status || 'scheduled',
      date: toDateValue(defaultStart),
      time: toTimeValue(defaultStart) || '10:00',
      duration_minutes: 60,
      location: defaults?.location || '',
      notes: defaults?.notes || '',
    });
  }, [props.appointment, props.defaultStartAt, props.defaults, props.open]);

  const canSave = draft.client_id.length > 0 && draft.title.trim().length > 2 && draft.date.length > 0;

  async function handleSave() {
    const [y, m, d] = draft.date.split('-').map(Number);
    const [hh, mm] = draft.time.split(':').map(Number);
    const startDate = new Date(y, m - 1, d, hh, mm);
    if (Number.isNaN(startDate.getTime())) return;
    const endDate = new Date(startDate.getTime() + draft.duration_minutes * 60 * 1000);

    await props.onSave({
      appointment_id: props.appointment?.id,
      client_id: draft.client_id,
      deal_id: props.appointment?.deal_id || props.defaults?.deal_id || null,
      title: draft.title.trim(),
      appointment_type: draft.appointment_type,
      status: draft.status,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      location: draft.location.trim() || null,
      notes: draft.notes.trim() || null,
    });
  }

  async function handleDelete() {
    if (!props.appointment?.id || !props.onDelete) return;
    await props.onDelete(props.appointment.id);
    setConfirmDelete(false);
  }

  const isEditing = Boolean(props.appointment);
  const activeDuration = DURATION_PRESETS.find((p) => p.minutes === draft.duration_minutes);

  return (
    <>
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar Agendamento' : 'Novo Agendamento'}</DialogTitle>
            <DialogDescription>Registre reuniões, ligações e demonstrações.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select
                value={draft.client_id || 'none'}
                onValueChange={(v) => setDraft((c) => ({ ...c, client_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione</SelectItem>
                  {props.clients.map((cl) => (
                    <SelectItem key={cl.id} value={cl.id}>{cl.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft((c) => ({ ...c, title: e.target.value }))}
                placeholder="Reunião com diretor comercial"
              />
            </div>

            <div className="grid gap-3 grid-cols-2">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={draft.appointment_type} onValueChange={(v) => setDraft((c) => ({ ...c, appointment_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={draft.status} onValueChange={(v) => setDraft((c) => ({ ...c, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 grid-cols-2">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={draft.date} onChange={(e) => setDraft((c) => ({ ...c, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Horário</Label>
                <Input type="time" value={draft.time} onChange={(e) => setDraft((c) => ({ ...c, time: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Duração</Label>
              <div className="flex gap-2 flex-wrap">
                {DURATION_PRESETS.map((p) => (
                  <Button
                    key={p.minutes}
                    type="button"
                    variant={draft.duration_minutes === p.minutes ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDraft((c) => ({ ...c, duration_minutes: p.minutes }))}
                  >
                    {p.label}
                  </Button>
                ))}
                {!activeDuration && (
                  <span className="flex items-center text-xs text-muted-foreground">{draft.duration_minutes} min</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Local / Link</Label>
              <Input
                value={draft.location}
                onChange={(e) => setDraft((c) => ({ ...c, location: e.target.value }))}
                placeholder="Google Meet, telefone ou endereço"
              />
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))}
                placeholder="Pontos a discutir, contexto do lead..."
              />
            </div>
          </div>

          <DialogFooter className="flex !justify-between">
            <div>
              {isEditing && props.onDelete && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.isSubmitting}>Cancelar</Button>
              <Button onClick={() => void handleSave()} disabled={!canSave || props.isSubmitting}>Salvar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O agendamento "{props.appointment?.title}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleDelete()}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
