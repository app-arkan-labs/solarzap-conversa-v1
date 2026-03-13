import { Button } from '@/components/ui/button';
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
import { RATE_SHORTCUTS, type UseProposalFormReturn } from '@/hooks/useProposalForm';
import type { GracePeriodUnit } from '@/types/proposalFinancing';
import { calcPMT } from '@/utils/financingCalc';

interface StepPaymentProps {
  form: UseProposalFormReturn;
}

export function StepPayment({ form }: StepPaymentProps) {
  const hasFinancingSelected = form.hasFinancingSelected;

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">Como sera o pagamento?</h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Valor total da proposta (R$)</Label>
          <Input
            type="number"
            min={0}
            value={form.formData.valorTotal || ''}
            onChange={(e) => form.handleChange('valorTotal', parseFloat(e.target.value) || 0)}
          />
          <p className="text-xs text-muted-foreground">
            Use este valor para ajustar o investimento final negociado com o cliente.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Desconto a vista (R$)</Label>
          <Input
            type="number"
            min={0}
            max={Math.max(0, Number(form.formData.valorTotal) || 0)}
            value={form.formData.descontoAvistaValor || ''}
            onChange={(e) => form.handleChange('descontoAvistaValor', Math.max(0, parseFloat(e.target.value) || 0))}
          />
          <p className="text-xs text-muted-foreground">
            Impacta payback e ROI quando houver condicao de pagamento a vista.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium">Resumo rapido</p>
          <p className="text-muted-foreground">
            Potencia: {Number(form.formData.potenciaSistema || 0).toFixed(2)} kWp
          </p>
          <p className="text-muted-foreground">
            Sistema: {form.formData.quantidadePaineis || 0} paineis
          </p>
          <p className="text-muted-foreground">
            Investimento: {form.formatCurrency(form.formData.valorTotal || 0)}
          </p>
          <p className="text-muted-foreground">
            A vista liquido: {form.formatCurrency(form.formData.valorAvistaLiquido || 0)}
          </p>
          <p className="text-muted-foreground">
            Base metricas: {form.formatCurrency(form.formData.investimentoBaseMetricas || 0)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Condicoes de pagamento</Label>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {form.options.PAYMENT_CONDITION_OPTIONS.map((option) => {
            const checked = form.formData.paymentConditions.includes(option.id);
            return (
              <label
                key={option.id}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${checked ? 'border-primary bg-primary/5' : ''}`}
              >
                <Checkbox checked={checked} onCheckedChange={() => form.togglePaymentCondition(option.id)} />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {hasFinancingSelected && (
        <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
          <div>
            <Label className="text-sm">Exibir simulacao de financiamento na proposta</Label>
            <p className="text-xs text-muted-foreground">Financiamento pode existir sem tabela de parcelas no PDF.</p>
          </div>
          <Checkbox
            checked={Boolean(form.formData.showFinancingSimulation)}
            onCheckedChange={(checked) => form.handleChange('showFinancingSimulation', Boolean(checked))}
          />
        </div>
      )}

      {hasFinancingSelected && form.formData.showFinancingSimulation && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Label>Financiamento multi-banco</Label>
            <Button type="button" variant="outline" size="sm" onClick={form.addFinancingCondition}>
              Adicionar instituicao
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {RATE_SHORTCUTS.map((shortcut) => (
              <Button
                key={shortcut.rate}
                type="button"
                variant="outline"
                size="sm"
                className={`text-xs ${form.primaryFinancingCondition?.interestRateMonthly === shortcut.rate ? 'border-primary bg-primary/10' : ''}`}
                onClick={() => form.applyRateShortcut(shortcut.rate)}
              >
                {shortcut.label}
              </Button>
            ))}
          </div>

          {form.formData.financingConditions.map((condition, index) => {
            const sortedInstallments = Array.from(new Set((condition.installments || [])
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value) && value > 0))).sort((a, b) => a - b);
            const isPrimary = form.primaryFinancingConditionId === condition.id;

            return (
              <div key={condition.id} className="space-y-3 rounded-lg border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={isPrimary}
                      onCheckedChange={(checked) => {
                        if (checked) form.setPrimaryFinancingInstitution(condition.id);
                      }}
                    />
                    <span>{`Instituicao ${index + 1}${isPrimary ? ' (principal)' : ''}`}</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => form.removeFinancingCondition(condition.id)}
                    disabled={form.formData.financingConditions.length <= 1}
                  >
                    Remover
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Instituicao financeira</Label>
                    <Input
                      value={condition.institutionName}
                      onChange={(e) => form.updateFinancingCondition(condition.id, 'institutionName', e.target.value)}
                      placeholder="Ex: Santander"
                      list="wizard-common-financing-institutions"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Taxa (% a.m.)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={condition.interestRateMonthly || ''}
                      onChange={(e) => form.updateFinancingCondition(
                        condition.id,
                        'interestRateMonthly',
                        parseFloat(e.target.value) || 0,
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Carencia</Label>
                    <div className="grid grid-cols-[1fr_120px] gap-2">
                      <Input
                        type="number"
                        min={0}
                        value={condition.gracePeriodValue || 0}
                        onChange={(e) => form.updateFinancingCondition(
                          condition.id,
                          'gracePeriodValue',
                          Math.max(0, parseInt(e.target.value, 10) || 0),
                        )}
                      />
                      <Select
                        value={condition.gracePeriodUnit}
                        onValueChange={(value) => form.updateFinancingCondition(
                          condition.id,
                          'gracePeriodUnit',
                          value as GracePeriodUnit,
                        )}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-popover">
                          <SelectItem value="dias">dias</SelectItem>
                          <SelectItem value="meses">meses</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Parcelas para simular</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {form.options.INSTALLMENT_OPTIONS.map((installment) => {
                      const selected = sortedInstallments.includes(installment);
                      return (
                        <Button
                          key={`${condition.id}-${installment}`}
                          type="button"
                          variant="outline"
                          size="sm"
                          className={`h-7 px-2 text-xs ${selected ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
                          onClick={() => form.toggleInstallment(condition.id, installment)}
                        >
                          {installment}x
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {sortedInstallments.length > 0 && condition.interestRateMonthly > 0 && form.formData.valorTotal > 0 && (
                  <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                    {sortedInstallments.map((installment) => {
                      const installmentValue = calcPMT(
                        condition.interestRateMonthly,
                        installment,
                        form.formData.valorTotal,
                      );
                      return (
                        <div key={`${condition.id}-preview-${installment}`} className="flex items-center justify-between">
                          <span>{installment}x</span>
                          <span className="font-medium text-foreground">
                            {form.formatCurrency(installmentValue)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <datalist id="wizard-common-financing-institutions">
            {form.options.COMMON_FINANCING_INSTITUTIONS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      )}

      {hasFinancingSelected && !form.formData.showFinancingSimulation && (
        <p className="text-xs text-muted-foreground">
          Financiamento marcado apenas como forma de pagamento, sem simulacao detalhada no PDF.
        </p>
      )}
    </div>
  );
}
