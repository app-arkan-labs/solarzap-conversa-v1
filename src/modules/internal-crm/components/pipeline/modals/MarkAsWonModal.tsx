import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { InternalCrmProduct } from '@/modules/internal-crm/types';

type MarkAsWonModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealTitle: string;
  productCode: string;
  valueReais: string;
  products: InternalCrmProduct[];
  isSubmitting: boolean;
  onProductCodeChange: (value: string) => void;
  onValueReaisChange: (value: string) => void;
  onConfirm: () => void;
};

function formatProductOption(product: InternalCrmProduct): string {
  const billingLabel = product.billing_type === 'recurring' ? 'Recorrente' : 'Pontual';
  return `${product.name} (${billingLabel})`;
}

export function MarkAsWonModal(props: MarkAsWonModalProps) {
  const canConfirm = props.productCode.trim().length > 0 && Number(props.valueReais || 0) > 0;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Marcar como Fechou Contrato
          </DialogTitle>
          <DialogDescription>
            Selecione o produto/plano e o valor do contrato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Deal</Label>
            <Input value={props.dealTitle || '-'} readOnly />
          </div>

          <div className="space-y-2">
            <Label>Produto / Plano</Label>
            <Select value={props.productCode} onValueChange={props.onProductCodeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um produto" />
              </SelectTrigger>
              <SelectContent>
                {props.products.map((product) => (
                  <SelectItem key={product.product_code} value={product.product_code}>
                    {formatProductOption(product)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={props.valueReais}
              onChange={(event) => props.onValueReaisChange(event.target.value)}
              placeholder="Ex: 1497.00"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={props.onConfirm} disabled={props.isSubmitting || !canConfirm}>
            Confirmar fechamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
