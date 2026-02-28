import { Button } from '@/components/ui/button';
import type { UseProposalFormReturn } from '@/hooks/useProposalForm';
import { ManualConfigPanel } from '../ManualConfigPanel';

interface StepReviewProps {
  form: UseProposalFormReturn;
  manualConfigOpen: boolean;
  onToggleManualConfig: () => void;
}

export function StepReview({ form, manualConfigOpen, onToggleManualConfig }: StepReviewProps) {
  const paymentLabels = form.options.PAYMENT_CONDITION_OPTIONS
    .filter((option) => form.formData.paymentConditions.includes(option.id))
    .map((option) => option.label);
  const sourceLabel = form.formData.irradianceSource === 'pvgis'
    ? 'PVGIS'
    : form.formData.irradianceSource === 'open_meteo'
      ? 'Open-Meteo por coordenada'
    : form.formData.irradianceSource === 'cache'
      ? 'cache solar'
      : 'media por UF (fallback)';

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">Revisao final</h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-green-50 p-3 dark:bg-green-950/40">
          <p className="text-xs text-muted-foreground">{form.isUsina ? 'Investimento total' : 'Valor total'}</p>
          <p className="text-lg font-semibold text-green-700 dark:text-green-400">
            {form.formatCurrency(form.formData.valorTotal || 0)}
          </p>
        </div>
        <div className="rounded-lg border bg-blue-50 p-3 dark:bg-blue-950/40">
          <p className="text-xs text-muted-foreground">{form.isUsina ? 'Receita anual' : 'Economia anual'}</p>
          <p className="text-lg font-semibold text-blue-700 dark:text-blue-400">
            {form.formatCurrency(form.previewAnnualRevenue || 0)}
          </p>
        </div>
        <div className="rounded-lg border bg-purple-50 p-3 dark:bg-purple-950/40">
          <p className="text-xs text-muted-foreground">Payback</p>
          <p className="text-lg font-semibold text-purple-700 dark:text-purple-400">
            {form.formData.paybackMeses || 0} meses
          </p>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Cliente</p>
            <p className="font-medium">{form.contact?.name || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tipo de projeto</p>
            <p className="font-medium">{form.formData.tipo_cliente}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Estado</p>
            <p className="font-medium">{form.formData.estado || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cidade</p>
            <p className="font-medium">{form.formData.cidade || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Endereco</p>
            <p className="font-medium">{form.formData.endereco || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {form.isUsina ? 'Geracao estimada' : 'Consumo mensal'}
            </p>
            <p className="font-medium">{form.formData.consumoMensal || 0} kWh/mes</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Potencia e paineis</p>
            <p className="font-medium">
              {Number(form.formData.potenciaSistema || 0).toFixed(2)} kWp | {form.formData.quantidadePaineis || 0} paineis
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pagamento</p>
            <p className="font-medium">{paymentLabels.join(', ') || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Modulo</p>
            <p className="font-medium">{form.formData.moduloMarca || '-'} {form.formData.moduloNome || ''}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Inversor</p>
            <p className="font-medium">{form.formData.inversorMarca || '-'} {form.formData.inversorNome || ''}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Localizacao tecnica</p>
            <p className="font-medium">
              {Number.isFinite(Number(form.formData.latitude)) && Number.isFinite(Number(form.formData.longitude))
                ? `${Number(form.formData.latitude).toFixed(5)}, ${Number(form.formData.longitude).toFixed(5)}`
                : '-'}
              {' '}({sourceLabel})
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
        <div>
          <p className="text-sm font-medium">Configuracao manual avancada</p>
          <p className="text-xs text-muted-foreground">
            Edite kit, tecnico e financeiro sem mudar a logica de geracao.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onToggleManualConfig}>
          {manualConfigOpen ? 'Fechar configuracao' : 'Configuracao manual'}
        </Button>
      </div>

      {manualConfigOpen && <ManualConfigPanel form={form} />}
    </div>
  );
}
