import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function PackPurchaseModal({
  open,
  onOpenChange,
  onBuy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBuy?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créditos insuficientes</DialogTitle>
          <DialogDescription>
            Você atingiu o limite de créditos deste ciclo. Compre um pack para continuar sem interromper a operação.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={onBuy}>Comprar pack</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
