import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TIPOS_LIGACAO, type UseProposalFormReturn } from '@/hooks/useProposalForm';

interface ManualConfigPanelProps {
  form: UseProposalFormReturn;
}

export function ManualConfigPanel({ form }: ManualConfigPanelProps) {
  const hasCoordinates = Number.isFinite(Number(form.formData.latitude))
    && Number.isFinite(Number(form.formData.longitude));
  const sourceLabel = form.formData.irradianceSource === 'pvgis'
    ? 'PVGIS'
    : 'nao resolvida';

  return (
    <div className="space-y-5 rounded-lg border bg-muted/20 p-4">
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Tecnico</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>CEP</Label>
            <Input value={form.formData.cep || ''} onChange={(e) => form.handleChange('cep', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Cidade</Label>
            <Input value={form.formData.cidade || ''} onChange={(e) => form.handleChange('cidade', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Endereco</Label>
            <Input value={form.formData.endereco || ''} onChange={(e) => form.handleChange('endereco', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Estado</Label>
            <Select value={form.formData.estado} onValueChange={(value) => form.handleChange('estado', value)}>
              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent className="bg-popover">
                {form.options.BRAZIL_STATES.map((state) => (
                  <SelectItem key={state.uf} value={state.uf}>{state.uf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Concessionaria</Label>
            <Input
              value={form.formData.concessionaria}
              onChange={(e) => form.handleChange('concessionaria', e.target.value)}
              list="wizard-distributors-list"
              placeholder="Ex: Neoenergia Coelba"
            />
          </div>
          <div className="space-y-1">
            <Label>Tipo de ligacao</Label>
            <Select
              value={form.formData.tipoLigacao}
              onValueChange={(value) => form.handleChange('tipoLigacao', value)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover">
                {TIPOS_LIGACAO.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Irradiancia (kWh/m2/dia)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.formData.irradiancia || ''}
              onChange={(e) => form.handleChange('irradiancia', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Performance Ratio</Label>
            <Input
              type="number"
              step="0.01"
              value={form.formData.performanceRatio || ''}
              onChange={(e) => form.handleChange('performanceRatio', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Custo disponibilidade (kWh)</Label>
            <Input
              type="number"
              min={0}
              value={form.formData.custoDisponibilidadeKwh || ''}
              onChange={(e) => form.handleChange('custoDisponibilidadeKwh', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Preco por kWp (R$)</Label>
            <Input
              type="number"
              min={0}
              value={form.formData.precoPorKwp || ''}
              onChange={(e) => form.handleChange('precoPorKwp', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1 md:col-span-3">
            <Label>Localizacao tecnica</Label>
            <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
              {hasCoordinates
                ? `${Number(form.formData.latitude).toFixed(5)}, ${Number(form.formData.longitude).toFixed(5)}`
                : 'Coordenadas nao resolvidas'}
              {' | '}Fonte: {sourceLabel}
              {' | '}Ref: {form.formData.irradianceRefAt ? new Date(form.formData.irradianceRefAt).toLocaleString('pt-BR') : '-'}
              {' | '}Req: {form.formData.irradianceRequestId || '-'}
            </div>
          </div>
        </div>
        <label className="flex items-start gap-2 rounded border bg-background p-2">
          <Checkbox
            checked={Boolean(form.formData.abaterCustoDisponibilidadeNoDimensionamento)}
            onCheckedChange={(checked) => form.handleChange(
              'abaterCustoDisponibilidadeNoDimensionamento',
              Boolean(checked),
            )}
          />
          <span className="text-xs text-muted-foreground">
            Abater custo de disponibilidade no dimensionamento
          </span>
        </label>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Dimensionamento</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label>Consumo (kWh/mes)</Label>
            <Input
              type="number"
              min={0}
              value={form.formData.consumoMensal || ''}
              onChange={(e) => form.handleChange('consumoMensal', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Potencia sistema (kWp)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={form.formData.potenciaSistema || ''}
              onChange={(e) => form.handleChange('potenciaSistema', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Quantidade de paineis</Label>
            <Input
              type="number"
              min={0}
              value={form.formData.quantidadePaineis || ''}
              onChange={(e) => form.handleChange('quantidadePaineis', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Valor total (R$)</Label>
            <Input
              type="number"
              min={0}
              value={form.formData.valorTotal || ''}
              onChange={(e) => form.handleChange('valorTotal', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Garantia servicos (anos)</Label>
            <Input
              type="number"
              min={0}
              value={form.formData.garantiaAnos || ''}
              onChange={(e) => form.handleChange('garantiaAnos', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Validade proposta (dias)</Label>
            <Input
              type="number"
              min={1}
              value={form.formData.validadeDias || 15}
              onChange={(e) => form.handleChange('validadeDias', parseInt(e.target.value, 10) || 15)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Kit (módulo, inversor e estrutura)</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Módulo nome/modelo</Label>
            <Input value={form.formData.moduloNome} onChange={(e) => form.handleChange('moduloNome', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Módulo marca</Label>
            <Input value={form.formData.moduloMarca} onChange={(e) => form.handleChange('moduloMarca', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Módulo tipo</Label>
            <Select value={form.formData.moduloTipo || 'Monocristalino'} onValueChange={(value) => form.handleChange('moduloTipo', value)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="bg-popover">
                {form.options.MODULE_TYPE_OPTIONS.map((moduleType) => (
                  <SelectItem key={moduleType} value={moduleType}>{moduleType}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Módulo potência (W)</Label>
            <Input
              type="number"
              min={0}
              value={form.formData.moduloPotencia || ''}
              onChange={(e) => form.handleChange('moduloPotencia', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Módulo garantia (anos)</Label>
            <Input
              type="number"
              min={0}
              value={form.formData.moduloGarantia || ''}
              onChange={(e) => form.handleChange('moduloGarantia', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Inversor nome/modelo</Label>
            <Input value={form.formData.inversorNome} onChange={(e) => form.handleChange('inversorNome', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Inversor marca</Label>
            <Input value={form.formData.inversorMarca} onChange={(e) => form.handleChange('inversorMarca', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Inversor potencia (kWp)</Label>
            <Input
              type="number"
              min={0}
              value={form.formData.inversorPotencia || ''}
              onChange={(e) => form.handleChange('inversorPotencia', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Inversor tensao (V)</Label>
            <Input
              type="number"
              min={0}
              value={form.formData.inversorTensao || ''}
              onChange={(e) => form.handleChange('inversorTensao', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Inversor garantia (anos)</Label>
            <Input
              type="number"
              min={0}
              value={form.formData.inversorGarantia || ''}
              onChange={(e) => form.handleChange('inversorGarantia', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Quantidade inversores</Label>
            <Input
              type="number"
              min={0}
              value={form.formData.inversorQtd || ''}
              onChange={(e) => form.handleChange('inversorQtd', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Estrutura tipo</Label>
            <Input value={form.formData.estruturaTipo} onChange={(e) => form.handleChange('estruturaTipo', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Posicao do telhado</Label>
            <Select
              value={form.formData.posicaoTelhado || 'nao_definido'}
              onValueChange={(value) => form.handleChange('posicaoTelhado', value)}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="bg-popover">
                {form.options.ROOF_POSITION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Sombreamento (%)</Label>
            <Input
              type="number"
              min={0}
              max={99}
              step="0.1"
              value={form.formData.sombreamentoPct ?? ''}
              onChange={(e) => form.handleChange('sombreamentoPct', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Financeiro avancado</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Rentabilidade (R$/kWh)</Label>
            <Input
              type="number"
              step="0.0001"
              min={0}
              value={form.formData.rentabilityRatePerKwh || ''}
              onChange={(e) => form.handleChange('rentabilityRatePerKwh', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Tarifa kWh</Label>
            <Input
              type="number"
              step="0.0001"
              min={0}
              value={form.formData.tarifaKwh || ''}
              onChange={(e) => form.handleChange('tarifaKwh', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>TE (R$/kWh)</Label>
            <Input
              type="number"
              step="0.0001"
              min={0}
              value={form.formData.teRatePerKwh || ''}
              onChange={(e) => form.handleChange('teRatePerKwh', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>TUSD (R$/kWh)</Label>
            <Input
              type="number"
              step="0.0001"
              min={0}
              value={form.formData.tusdRatePerKwh || ''}
              onChange={(e) => form.handleChange('tusdRatePerKwh', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Compensacao TUSD (%)</Label>
            <p className="text-xs text-muted-foreground">
              Percentual do Fio B compensado pelos creditos solares (Lei 14.300/2022)
            </p>
            <Input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={form.formData.tusdCompensationPct || 0}
              onChange={(e) => form.handleChange('tusdCompensationPct', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Aumento anual energia (%)</Label>
            <p className="text-xs text-muted-foreground">
              Pode variar conforme bandeira tarifaria e regulacao vigente
            </p>
            <Input
              type="number"
              step="0.1"
              min={0}
              value={form.formData.annualEnergyIncreasePct || 0}
              onChange={(e) => form.handleChange('annualEnergyIncreasePct', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Degradação módulo (%)</Label>
            <Input
              type="number"
              step="0.1"
              min={0}
              value={form.formData.moduleDegradationPct || 0}
              onChange={(e) => form.handleChange('moduleDegradationPct', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>O&M anual (%)</Label>
            <Input
              type="number"
              step="0.1"
              min={0}
              value={form.formData.annualOmCostPct || 0}
              onChange={(e) => form.handleChange('annualOmCostPct', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>O&M anual fixo (R$)</Label>
            <Input
              type="number"
              min={0}
              value={form.formData.annualOmCostFixed || 0}
              onChange={(e) => form.handleChange('annualOmCostFixed', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      <datalist id="wizard-distributors-list">
        {form.options.ENERGY_DISTRIBUTOR_OPTIONS.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
}
