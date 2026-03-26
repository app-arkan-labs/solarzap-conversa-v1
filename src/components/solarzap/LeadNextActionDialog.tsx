import { useEffect, useState } from 'react';
import type { Contact, LeadTask } from '@/types/solarzap';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LEAD_TASK_CHANNEL_LABELS, LEAD_TASK_PRIORITY_LABELS } from '@/lib/leadNextActions';
import { useToast } from '@/hooks/use-toast';

type LeadNextActionDialogMode = 'create' | 'edit' | 'complete';

type LeadNextActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: LeadNextActionDialogMode;
  contact: Contact;
  action?: LeadTask | null;
  onCreate?: (input: {
    leadId: number;
    title: string;
    notes?: string | null;
    dueAt?: Date | null;
    priority?: LeadTask['priority'];
    channel?: LeadTask['channel'];
    userId?: string | null;
  }) => Promise<void>;
  onUpdate?: (input: {
    taskId: string;
    title?: string;
    notes?: string | null;
    dueAt?: Date | null;
    priority?: LeadTask['priority'];
    channel?: LeadTask['channel'];
    userId?: string | null;
  }) => Promise<void>;
  onComplete?: (task: LeadTask, resultSummary: string) => Promise<void>;
};

const toDateTimeLocalValue = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export function LeadNextActionDialog({
  open,
  onOpenChange,
  mode,
  contact,
  action,
  onCreate,
  onUpdate,
  onComplete,
}: LeadNextActionDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<LeadTask['priority']>('medium');
  const [channel, setChannel] = useState<LeadTask['channel']>('whatsapp');
  const [resultSummary, setResultSummary] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && action) {
      setTitle(action.title || '');
      setNotes(action.notes || '');
      setDueAt(toDateTimeLocalValue(action.dueAt));
      setPriority(action.priority || 'medium');
      setChannel(action.channel || 'whatsapp');
      setResultSummary('');
      return;
    }

    setTitle('');
    setNotes('');
    setDueAt('');
    setPriority('medium');
    setChannel('whatsapp');
    setResultSummary('');
  }, [action, mode, open]);

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      if (mode === 'complete') {
        if (!action || !onComplete) return;
        await onComplete(action, resultSummary.trim());
        onOpenChange(false);
        return;
      }

      const payload = {
        leadId: Number(contact.id),
        title: title.trim(),
        notes: notes.trim() || null,
        dueAt: dueAt ? new Date(dueAt) : null,
        priority,
        channel,
        userId: contact.assignedToUserId || null,
      };

      if (!payload.title) return;

      if (mode === 'create' && onCreate) {
        await onCreate(payload);
        onOpenChange(false);
        return;
      }

      if (mode === 'edit' && action && onUpdate) {
        await onUpdate({
          taskId: action.id,
          title: payload.title,
          notes: payload.notes,
          dueAt: payload.dueAt,
          priority: payload.priority,
          channel: payload.channel,
          userId: payload.userId,
        });
        onOpenChange(false);
      }
    } catch (error) {
      toast({
        title: mode === 'complete' ? 'Erro ao concluir acao' : 'Erro ao salvar acao',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const titleByMode: Record<LeadNextActionDialogMode, string> = {
    create: 'Criar proxima acao',
    edit: 'Editar proxima acao',
    complete: 'Concluir acao',
  };

  const descriptionByMode: Record<LeadNextActionDialogMode, string> = {
    create: `Defina o proximo compromisso operacional para ${contact.name}.`,
    edit: `Ajuste a proxima acao ativa de ${contact.name}.`,
    complete: `Registre o resultado da acao concluida para ${contact.name}.`,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{titleByMode[mode]}</DialogTitle>
          <DialogDescription>{descriptionByMode[mode]}</DialogDescription>
        </DialogHeader>

        {mode === 'complete' ? (
          <div className="space-y-3 py-1">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold text-muted-foreground">Acao atual</p>
              <p className="mt-1 text-sm font-medium text-foreground">{action?.title || 'Acao ativa'}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-next-action-result">Resultado</Label>
              <Textarea
                id="lead-next-action-result"
                value={resultSummary}
                onChange={(event) => setResultSummary(event.target.value)}
                placeholder="Ex.: cliente pediu retorno na sexta com a esposa"
                className="min-h-[120px]"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="lead-next-action-title">Acao</Label>
              <Input
                id="lead-next-action-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Retornar quinta 10:00"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lead-next-action-due">Prazo</Label>
                <Input
                  id="lead-next-action-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as LeadTask['priority'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEAD_TASK_PRIORITY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={channel || 'whatsapp'} onValueChange={(value) => setChannel(value as LeadTask['channel'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAD_TASK_CHANNEL_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-next-action-notes">Notas</Label>
              <Textarea
                id="lead-next-action-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Contexto curto para a acao"
                className="min-h-[96px]"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              void handleSubmit();
            }}
            disabled={
              isSubmitting ||
              (mode === 'complete' ? resultSummary.trim().length === 0 : title.trim().length === 0)
            }
          >
            {mode === 'complete' ? 'Concluir acao' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
