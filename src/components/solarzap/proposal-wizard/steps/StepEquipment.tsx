import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { UseProposalFormReturn } from '@/hooks/useProposalForm';

interface StepEquipmentProps {
  form: UseProposalFormReturn;
}

export function StepEquipment({ form }: StepEquipmentProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">Equipamento e investimento</h3>

      <Tabs defaultValue="modulo" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="modulo">Modulo</TabsTrigger>
          <TabsTrigger value="inversor">Inversor</TabsTrigger>
        </TabsList>

        <TabsContent value="modulo" className="space-y-3 pt-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome / modelo do modulo</Label>
              <Input
                value={form.formData.moduloNome || ''}
                onChange={(e) => form.handleChange('moduloNome', e.target.value)}
                placeholder="Ex: HN21RN-66HT"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Marca do modulo</Label>
              <Input
                value={form.formData.moduloMarca || ''}
                onChange={(e) => form.handleChange('moduloMarca', e.target.value)}
                placeholder="Ex: Hanersun"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo do modulo</Label>
              <Input
                value={form.formData.moduloTipo || ''}
                onChange={(e) => form.handleChange('moduloTipo', e.target.value)}
                placeholder="Ex: Monocristalino"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Potencia do modulo (W)</Label>
              <Input
                type="number"
                min={0}
                value={form.formData.moduloPotencia || ''}
                onChange={(e) => form.handleChange('moduloPotencia', parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Garantia do modulo (anos)</Label>
              <Input
                type="number"
                min={0}
                value={form.formData.moduloGarantia || ''}
                onChange={(e) => form.handleChange('moduloGarantia', parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="inversor" className="space-y-3 pt-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome / modelo do inversor</Label>
              <Input
                value={form.formData.inversorNome || ''}
                onChange={(e) => form.handleChange('inversorNome', e.target.value)}
                placeholder="Ex: SUN2000-5KTL"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Marca do inversor</Label>
              <Input
                value={form.formData.inversorMarca || ''}
                onChange={(e) => form.handleChange('inversorMarca', e.target.value)}
                placeholder="Ex: Huawei"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Potencia do inversor (kWp)</Label>
              <Input
                type="number"
                min={0}
                value={form.formData.inversorPotencia || ''}
                onChange={(e) => form.handleChange('inversorPotencia', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tensao do inversor (V)</Label>
              <Input
                type="number"
                min={0}
                value={form.formData.inversorTensao || ''}
                onChange={(e) => form.handleChange('inversorTensao', parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade de inversores</Label>
              <Input
                type="number"
                min={0}
                value={form.formData.inversorQtd || ''}
                onChange={(e) => form.handleChange('inversorQtd', parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Garantia do inversor (anos)</Label>
              <Input
                type="number"
                min={0}
                value={form.formData.inversorGarantia || ''}
                onChange={(e) => form.handleChange('inversorGarantia', parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de estrutura</Label>
            <Input
              value={form.formData.estruturaTipo || ''}
              onChange={(e) => form.handleChange('estruturaTipo', e.target.value)}
              placeholder="Ex: Telhado ceramico / Solo 2 linhas"
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Preco por kWp (R$)</Label>
          <Input
            type="number"
            min={0}
            value={form.formData.precoPorKwp || ''}
            onChange={(e) => form.handleChange('precoPorKwp', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Valor total (R$)</Label>
          <Input
            type="number"
            min={0}
            value={form.formData.valorTotal || ''}
            onChange={(e) => form.handleChange('valorTotal', parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium">
          {form.formData.quantidadePaineis || 0} paineis de {form.formData.moduloPotencia || 0}W
        </p>
        <p className="text-muted-foreground">
          {Number(form.formData.potenciaSistema || 0).toFixed(2)} kWp | Investimento: {form.formatCurrency(form.formData.valorTotal || 0)}
        </p>
      </div>
    </div>
  );
}
