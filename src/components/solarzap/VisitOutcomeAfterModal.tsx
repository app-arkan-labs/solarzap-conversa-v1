import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface VisitOutcomeItem {
  appointment_id: string;
  lead_id: number;
  lead_name: string | null;
  lead_stage: string | null;
  start_at: string;
  end_at: string;
  title: string | null;
  notes: string | null;
}

interface VisitOutcomeAfterModalProps {
  item: VisitOutcomeItem | null;
  open: boolean;
  submitting?: boolean;
  onSubmit: (targetStage: string, notes: string) => Promise<void> | void;
  onClose: () => void;
}

const OUTCOME_OPTIONS = [
  { value: 'proposta_negociacao', label: 'Proposta em negociação' },
  { value: 'financiamento', label: 'Financiamento' },
  { value: 'aprovou_projeto', label: 'Aprovou projeto' },
  { value: 'contrato_assinado', label: 'Contrato assinado' },
  { value: 'projeto_pago', label: 'Projeto pago' },
];

export function VisitOutcomeAfterModal({
  item,
  open,
  submitting = false,
  onSubmit,
  onClose,
}: VisitOutcomeAfterModalProps) {
  const [notes, setNotes] = useState('');

  const handleSubmit = async (targetStage: string) => {
    await onSubmit(targetStage, notes.trim());
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Como foi a visita?</DialogTitle>
          <DialogDescription>
            {item?.lead_name ? `Lead: ${item.lead_name}` : 'Registre o resultado da visita para mover a etapa.'}
          </DialogDescription>
        </DialogHeader>

        {item && (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{item.title || 'Visita técnica'}</p>
              <p>
                {format(new Date(item.start_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notas rápidas (opcional)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Resumo do que aconteceu na visita..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {OUTCOME_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant="outline"
                  disabled={submitting}
                  onClick={() => handleSubmit(option.value)}
                  className="justify-start"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
