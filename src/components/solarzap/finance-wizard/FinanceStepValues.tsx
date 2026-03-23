import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface FinanceStepValuesProps {
  saleValue: number;
  projectCost: number;
  notes: string;
  marginValue: number;
  marginPct: number;
  formatCurrency: (value: number) => string;
  disabled?: boolean;
  onSaleValueChange: (value: number) => void;
  onProjectCostChange: (value: number) => void;
  onNotesChange: (value: string) => void;
}

export function FinanceStepValues({
  saleValue,
  projectCost,
  notes,
  marginValue,
  marginPct,
  formatCurrency,
  disabled = false,
  onSaleValueChange,
  onProjectCostChange,
  onNotesChange,
}: FinanceStepValuesProps) {
  const marginPositive = marginValue >= 0;
  const numericInputClassName = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1.4fr_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Valor da venda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="finance-sale-value">Valor da venda (R$)</Label>
            <Input
              id="finance-sale-value"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className={numericInputClassName}
              value={saleValue}
              disabled={disabled}
              onChange={(event) => onSaleValueChange(Number(event.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Esse valor alimenta o total esperado do plano de recebimento.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Custo do projeto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="finance-project-cost">Custo do projeto (R$)</Label>
            <Input
              id="finance-project-cost"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className={numericInputClassName}
              value={projectCost}
              disabled={disabled}
              onChange={(event) => onProjectCostChange(Number(event.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Use o custo previsto para acompanhar o lucro previsto e o lucro reconhecido depois.
            </p>
          </CardContent>
        </Card>

        <Card className={cn('border-primary/20 bg-primary/5', !marginPositive && 'border-destructive/20 bg-destructive/5')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Lucro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className={cn('text-2xl font-semibold', !marginPositive && 'text-destructive')}>
              {formatCurrency(marginValue)}
            </p>
            <p className={cn('text-sm font-medium', !marginPositive && 'text-destructive')}>
              {marginPct.toFixed(2)}%
            </p>
            <p className="text-xs text-muted-foreground">
              Calculada em tempo real a partir do valor de venda e do custo informado.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Observações financeiras</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="finance-notes">Observações internas</Label>
          <Textarea
            id="finance-notes"
            value={notes}
            rows={4}
            disabled={disabled}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Ex.: condições comerciais, acordos de entrada, taxas adicionais ou observações do fechamento."
          />
        </CardContent>
      </Card>
    </div>
  );
}
