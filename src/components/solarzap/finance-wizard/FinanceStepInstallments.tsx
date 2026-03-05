import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PAYMENT_METHOD_LABELS, PaymentMethod, SaleInstallmentInput } from '@/types/finance';
import { getEntryInstallmentMethods, getRegularInstallmentMethods } from '@/lib/saleFinance';
import { cn } from '@/lib/utils';

interface FinanceStepInstallmentsProps {
  saleValue: number;
  selectedMethods: PaymentMethod[];
  entryInstallment: SaleInstallmentInput | null;
  installments: SaleInstallmentInput[];
  installmentsTotal: number;
  progressPct: number;
  totalsMatch: boolean;
  remainingAmount: number;
  disabled?: boolean;
  formatCurrency: (value: number) => string;
  onAddEntry: () => void;
  onRemoveEntry: () => void;
  onAddInstallment: () => void;
  onRemoveInstallment: (index: number) => void;
  onEntryChange: (patch: Partial<SaleInstallmentInput>) => void;
  onInstallmentChange: (index: number, patch: Partial<SaleInstallmentInput>) => void;
  onToggleEntryMethod: (method: PaymentMethod) => void;
  onToggleInstallmentMethod: (index: number, method: PaymentMethod) => void;
}

type InstallmentCardProps = {
  title: string;
  installment: SaleInstallmentInput;
  disabled: boolean;
  canRemove: boolean;
  paymentMethodOrder: PaymentMethod[];
  onChange: (patch: Partial<SaleInstallmentInput>) => void;
  onToggleMethod: (method: PaymentMethod) => void;
  onRemove?: () => void;
};

function InstallmentCard({
  title,
  installment,
  disabled,
  canRemove,
  paymentMethodOrder,
  onChange,
  onToggleMethod,
  onRemove,
}: InstallmentCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>Valor, vencimento, modalidade e observacoes.</CardDescription>
          </div>
          {onRemove ? (
            <Button type="button" variant="ghost" size="icon" disabled={!canRemove || disabled} onClick={onRemove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              disabled={disabled}
              value={installment.amount}
              onChange={(event) => onChange({ amount: Number(event.target.value) || 0 })}
            />
          </div>

          <div className="space-y-2">
            <Label>Vencimento</Label>
            <Input
              type="date"
              disabled={disabled}
              value={installment.due_on}
              onChange={(event) => onChange({ due_on: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Observacao</Label>
            <Input
              value={installment.notes || ''}
              disabled={disabled}
              placeholder="Opcional"
              onChange={(event) => onChange({ notes: event.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Modalidades desta parcela</Label>
          <div className="flex flex-wrap gap-2">
            {paymentMethodOrder.map((method) => {
              const active = installment.payment_methods.includes(method);

              return (
                <Button
                  key={`${title}-${method}`}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  disabled={disabled}
                  onClick={() => onToggleMethod(method)}
                >
                  {PAYMENT_METHOD_LABELS[method]}
                </Button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function FinanceStepInstallments({
  saleValue,
  selectedMethods,
  entryInstallment,
  installments,
  installmentsTotal,
  progressPct,
  totalsMatch,
  remainingAmount,
  disabled = false,
  formatCurrency,
  onAddEntry,
  onRemoveEntry,
  onAddInstallment,
  onRemoveInstallment,
  onEntryChange,
  onInstallmentChange,
  onToggleEntryMethod,
  onToggleInstallmentMethod,
}: FinanceStepInstallmentsProps) {
  const hasFinancing = selectedMethods.includes('financing');
  const regularInstallmentMethods = getRegularInstallmentMethods(selectedMethods);
  const entryInstallmentMethods = getEntryInstallmentMethods(selectedMethods);
  const progressWidth = Math.max(0, Math.min(progressPct, 100));
  const paymentModeIsSimple = selectedMethods.length === 1 && !hasFinancing;
  const showEntrySection = hasFinancing && entryInstallmentMethods.length > 0;

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold">Totalizacao em tempo real</p>
              <p className="text-sm text-muted-foreground">
                Preenchido: {formatCurrency(installmentsTotal)} / {formatCurrency(saleValue)} ({progressPct.toFixed(1)}%)
              </p>
            </div>
            <p className={cn('text-sm font-medium', totalsMatch ? 'text-emerald-600' : 'text-destructive')}>
              {totalsMatch
                ? 'O total das parcelas bate exatamente com o valor da venda.'
                : `Ajuste pendente: ${formatCurrency(remainingAmount)}`}
            </p>
          </div>

          <div className="h-2 w-full rounded-full bg-background/80">
            <div
              className={cn(
                'h-2 rounded-full transition-all',
                totalsMatch ? 'bg-emerald-500' : progressPct > 100 ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ width: `${progressWidth}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {paymentModeIsSimple ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Pagamento simples detectado. O wizard preenche uma parcela unica com o valor total e voce pode ajustar se
              necessario.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {showEntrySection ? (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="text-base">Entrada</CardTitle>
                <CardDescription>Opcional. Use para separar o valor pago fora do financiamento.</CardDescription>
              </div>
              {entryInstallment ? (
                <Button type="button" variant="outline" disabled={disabled} onClick={onRemoveEntry}>
                  Remover entrada
                </Button>
              ) : (
                <Button type="button" variant="outline" disabled={disabled} onClick={onAddEntry}>
                  Adicionar entrada
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {entryInstallment ? (
              <InstallmentCard
                title="Entrada"
                installment={entryInstallment}
                disabled={disabled}
                canRemove
                paymentMethodOrder={entryInstallmentMethods}
                onChange={onEntryChange}
                onToggleMethod={onToggleEntryMethod}
              />
            ) : (
              <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                Nenhuma entrada separada. Se existir sinal ou pagamento antecipado, adicione aqui.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="text-base">Parcelas</CardTitle>
              <CardDescription>
                Monte a estrutura de cobranca. Apenas as modalidades escolhidas na etapa anterior ficam disponiveis.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" disabled={disabled} onClick={onAddInstallment}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar parcela
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {installments.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              Nenhuma parcela cadastrada. Adicione a primeira parcela para continuar.
            </div>
          ) : (
            installments.map((installment, index) => (
              <InstallmentCard
                key={`installment-${index}-${installment.installment_no}`}
                title={`Parcela ${index + 1}`}
                installment={installment}
                disabled={disabled}
                canRemove={installments.length > 1 || entryInstallment !== null}
                paymentMethodOrder={regularInstallmentMethods}
                onChange={(patch) => onInstallmentChange(index, patch)}
                onToggleMethod={(method) => onToggleInstallmentMethod(index, method)}
                onRemove={() => onRemoveInstallment(index)}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
