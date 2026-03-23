import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type FollowUpLostReasonKey =
  | 'sem_resposta'
  | 'sem_interesse'
  | 'concorrente'
  | 'timing'
  | 'financeiro'
  | 'outro';

interface FollowUpExhaustedModalProps {
  open: boolean;
  leadName: string;
  submitting?: boolean;
  onKeepCurrent: () => Promise<void> | void;
  onDisableFollowUp: () => Promise<void> | void;
  onMoveToLost: (reasonKey: FollowUpLostReasonKey, reasonDetail?: string) => Promise<void> | void;
}

const LOST_REASON_OPTIONS: Array<{ value: FollowUpLostReasonKey; label: string }> = [
  { value: 'sem_resposta', label: 'Não respondeu' },
  { value: 'sem_interesse', label: 'Sem interesse' },
  { value: 'concorrente', label: 'Fechou com concorrente' },
  { value: 'timing', label: 'Não é o momento' },
  { value: 'financeiro', label: 'Sem condição financeira' },
  { value: 'outro', label: 'Outro' },
];

export function FollowUpExhaustedModal({
  open,
  leadName,
  submitting = false,
  onKeepCurrent,
  onDisableFollowUp,
  onMoveToLost,
}: FollowUpExhaustedModalProps) {
  const [reasonKey, setReasonKey] = useState<FollowUpLostReasonKey | ''>('');
  const [reasonDetail, setReasonDetail] = useState('');

  const canSubmitLost = useMemo(() => {
    if (!reasonKey) return false;
    if (reasonKey === 'outro') {
      return reasonDetail.trim().length > 0;
    }
    return true;
  }, [reasonDetail, reasonKey]);

  const handleMoveToLost = async () => {
    if (!reasonKey || !canSubmitLost) return;
    await onMoveToLost(reasonKey, reasonDetail.trim() || undefined);
    setReasonKey('');
    setReasonDetail('');
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Follow-up exaurido</DialogTitle>
          <DialogDescription>
            O lead <strong>{leadName || 'Selecionado'}</strong> não respondeu aos últimos 5 follow-ups.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="space-y-2">
              <Label>Motivo para mover para Perdido</Label>
              <Select value={reasonKey} onValueChange={(value) => setReasonKey(value as FollowUpLostReasonKey)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um motivo" />
                </SelectTrigger>
                <SelectContent>
                  {LOST_REASON_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Detalhes (opcional, obrigatorio para "Outro")</Label>
              <Textarea
                value={reasonDetail}
                onChange={(event) => setReasonDetail(event.target.value)}
                rows={3}
                placeholder="Detalhe adicional para o motivo"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void onKeepCurrent();
            }}
            disabled={submitting}
          >
            Manter na etapa atual
          </Button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void onDisableFollowUp();
              }}
              disabled={submitting}
            >
              Desabilitar follow-up
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void handleMoveToLost();
              }}
              disabled={submitting || !canSubmitLost}
            >
              Mover para Perdido
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
