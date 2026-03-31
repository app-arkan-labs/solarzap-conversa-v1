import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrencyBr } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmClientSummary, InternalCrmProduct, InternalCrmStage } from '@/modules/internal-crm/types';

const STAGE_LABELS: Record<string, string> = {
  novo_lead: 'Novo Lead',
  respondeu: 'Respondeu',
  agendou_reuniao: 'Agendou Reunião',
  chamada_agendada: 'Reunião Agendada',
  chamada_realizada: 'Reunião Realizada',
  nao_compareceu: 'Não Compareceu',
  negociacao: 'Negociação',
  fechou: 'Fechou Contrato',
  nao_fechou: 'Não Fechou',
};

function formatProductLabel(product: InternalCrmProduct): string {
  const price = formatCurrencyBr(product.price_cents);
  const suffix = product.billing_type === 'recurring' ? '/mês' : '';
  return `${product.name} (${price}${suffix})`;
}

export type NewDealData = {
  client_id: string;
  title: string;
  product_code: string;
  stage_code: string;
  notes: string;
};

type NewDealSimpleModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: InternalCrmClientSummary[];
  stages: InternalCrmStage[];
  products: InternalCrmProduct[];
  onSave: (data: NewDealData) => void;
  isSaving: boolean;
};

export function NewDealSimpleModal(props: NewDealSimpleModalProps) {
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [productCode, setProductCode] = useState('');
  const [stageCode, setStageCode] = useState('novo_lead');
  const [notes, setNotes] = useState('');

  const canSave = clientId.trim().length > 0 && title.trim().length > 0;

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (!open) {
      setClientId('');
      setTitle('');
      setProductCode('');
      setStageCode('novo_lead');
      setNotes('');
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Novo Lead
          </DialogTitle>
          <DialogDescription>
            Cadastre um novo lead na pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {props.clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: João — SolarZap Pro"
            />
          </div>

          <div className="space-y-2">
            <Label>Produto / Plano</Label>
            <Select value={productCode} onValueChange={setProductCode}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um produto (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {props.products.filter((p) => p.is_active).map((product) => (
                  <SelectItem key={product.product_code} value={product.product_code}>
                    {formatProductLabel(product)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Etapa inicial</Label>
            <Select value={stageCode} onValueChange={setStageCode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.stages.map((stage) => (
                  <SelectItem key={stage.stage_code} value={stage.stage_code}>
                    {STAGE_LABELS[stage.stage_code] || stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações sobre o lead (opcional)"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => props.onSave({ client_id: clientId, title, product_code: productCode, stage_code: stageCode, notes })}
            disabled={props.isSaving || !canSave}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
