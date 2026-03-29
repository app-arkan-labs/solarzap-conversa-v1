import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AssignOwnerSelect } from '@/modules/internal-crm/components/pipeline/AssignOwnerSelect';
import type { InternalCrmClientSummary, InternalCrmProduct, InternalCrmStage } from '@/modules/internal-crm/types';
import type { DealDraft } from '@/modules/internal-crm/components/pipeline/types';

type EditDealModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: DealDraft;
  onDraftChange: (draft: DealDraft) => void;
  clients: InternalCrmClientSummary[];
  stages: InternalCrmStage[];
  products: InternalCrmProduct[];
  ownerUserId: string;
  onOwnerUserIdChange: (value: string) => void;
  onSave: () => void;
  isSaving: boolean;
};

export function EditDealModal(props: EditDealModalProps) {
  const productByCode = new Map(props.products.map((product) => [product.product_code, product]));

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Novo deal interno</DialogTitle>
          <DialogDescription>Cadastre uma oportunidade comercial e associe os itens vendidos.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select
              value={props.draft.client_id}
              onValueChange={(value) => props.onDraftChange({ ...props.draft, client_id: value })}
            >
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
            <Label>Titulo</Label>
            <Input
              value={props.draft.title}
              onChange={(event) => props.onDraftChange({ ...props.draft, title: event.target.value })}
              placeholder="Ex: Plano Pro + Mentoria Aceleracao"
            />
          </div>

          <div className="space-y-2">
            <Label>Etapa</Label>
            <Select
              value={props.draft.stage_code}
              onValueChange={(value) => props.onDraftChange({ ...props.draft, stage_code: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.stages.map((stage) => (
                  <SelectItem key={stage.stage_code} value={stage.stage_code}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Probabilidade (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={props.draft.probability}
              onChange={(event) => props.onDraftChange({ ...props.draft, probability: Number(event.target.value || 0) })}
            />
          </div>

          <AssignOwnerSelect ownerUserId={props.ownerUserId} onOwnerUserIdChange={props.onOwnerUserIdChange} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Itens do deal</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                props.onDraftChange({
                  ...props.draft,
                  items: [
                    ...props.draft.items,
                    {
                      product_code: '',
                      billing_type: 'one_time',
                      payment_method: 'manual',
                      unit_price_cents: 0,
                      quantity: 1,
                    },
                  ],
                })
              }
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Adicionar item
            </Button>
          </div>

          <div className="space-y-3">
            {props.draft.items.map((item, index) => {
              const selectedProduct = productByCode.get(item.product_code);
              return (
                <div key={`${item.product_code}-${index}`} className="grid gap-3 rounded-xl border border-border/70 p-3 md:grid-cols-[1.8fr_1fr_0.7fr_auto]">
                  <div className="space-y-2">
                    <Label>Produto</Label>
                    <Select
                      value={item.product_code}
                      onValueChange={(value) => {
                        const product = productByCode.get(value);
                        props.onDraftChange({
                          ...props.draft,
                          items: props.draft.items.map((entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  product_code: value,
                                  billing_type: product?.billing_type || 'one_time',
                                  payment_method: product?.payment_method || 'manual',
                                  unit_price_cents: product?.price_cents || 0,
                                  quantity: entry.quantity,
                                }
                              : entry,
                          ),
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {props.products.map((product) => (
                          <SelectItem key={product.product_code} value={product.product_code}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedProduct ? (
                      <p className="text-xs text-muted-foreground">
                        Forma: {selectedProduct.payment_method} · Tipo: {selectedProduct.billing_type}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label>Preco (centavos)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={item.unit_price_cents}
                      onChange={(event) =>
                        props.onDraftChange({
                          ...props.draft,
                          items: props.draft.items.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, unit_price_cents: Number(event.target.value || 0) }
                              : entry,
                          ),
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Qtd.</Label>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) =>
                        props.onDraftChange({
                          ...props.draft,
                          items: props.draft.items.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, quantity: Number(event.target.value || 1) }
                              : entry,
                          ),
                        })
                      }
                    />
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        props.onDraftChange({
                          ...props.draft,
                          items:
                            props.draft.items.length > 1
                              ? props.draft.items.filter((_, entryIndex) => entryIndex !== index)
                              : props.draft.items,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Notas</Label>
          <Textarea
            rows={4}
            value={props.draft.notes}
            onChange={(event) => props.onDraftChange({ ...props.draft, notes: event.target.value })}
            placeholder="Contexto da negociacao, objeções e próximos passos"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={props.onSave} disabled={props.isSaving}>
            <Save className="mr-1.5 h-4 w-4" />
            Salvar deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
