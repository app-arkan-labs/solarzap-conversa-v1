import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type MarkAsLostModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealTitle: string;
  lostReason: string;
  onLostReasonChange: (value: string) => void;
  onConfirm: () => void;
  isSubmitting: boolean;
};

export function MarkAsLostModal(props: MarkAsLostModalProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Marcar como nao fechou
          </DialogTitle>
          <DialogDescription>
            Informe o motivo comercial para o deal {props.dealTitle || 'selecionado'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Motivo</Label>
          <Textarea
            rows={4}
            value={props.lostReason}
            onChange={(event) => props.onLostReasonChange(event.target.value)}
            placeholder="Ex: orcamento fora da faixa, concorrente mais barato, timing inadequado"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={props.onConfirm} disabled={props.isSubmitting || !props.lostReason.trim()}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
