import { Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PAYMENT_METHOD_GROUPS, PAYMENT_METHOD_LABELS, PaymentMethod } from '@/types/finance';
import { cn } from '@/lib/utils';

const PAYMENT_METHOD_HINTS: Record<PaymentMethod, string> = {
  pix: 'Liquidação instantânea.',
  boleto: 'Cobrança com vencimento definido.',
  credit_card: 'Parcelamento e captura por crédito.',
  debit_card: 'Recebimento no débito.',
  bank_transfer: 'TED, DOC ou transferência interna.',
  financing: 'Contrato com banco ou financeira.',
  cash: 'Recebimento em dinheiro.',
  check: 'Pagamento por cheque.',
  other: 'Caso especial ou combinado fora do padrão.',
};

interface FinanceStepPaymentMethodProps {
  selectedMethods: PaymentMethod[];
  disabled?: boolean;
  onToggleMethod: (method: PaymentMethod) => void;
}

export function FinanceStepPaymentMethod({
  selectedMethods,
  disabled = false,
  onToggleMethod,
}: FinanceStepPaymentMethodProps) {
  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Escolha as modalidades padrão do negócio. Elas definem quais formas de pagamento ficam disponíveis na
            etapa de parcelas e podem ser ajustadas por parcela dentro dessa seleção.
          </p>
        </CardContent>
      </Card>

      {PAYMENT_METHOD_GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{group.title}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {group.methods.map((method) => {
              const active = selectedMethods.includes(method);

              return (
                <button
                  key={method}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => onToggleMethod(method)}
                  className={cn(
                    'flex min-h-24 flex-col items-start justify-between rounded-xl border px-4 py-3 text-left transition-colors',
                    active && 'border-primary bg-primary/10 shadow-sm',
                    !active && 'border-border hover:border-primary/40 hover:bg-muted/50',
                    disabled && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{PAYMENT_METHOD_LABELS[method]}</span>
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full border',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/30 text-transparent',
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{PAYMENT_METHOD_HINTS[method]}</p>
                </button>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <div
        className={cn(
          'rounded-lg border px-4 py-3 text-sm',
          selectedMethods.length > 0
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700'
            : 'border-amber-500/30 bg-amber-500/5 text-amber-800',
        )}
      >
        {selectedMethods.length > 0
          ? `Selecionadas: ${selectedMethods.map((method) => PAYMENT_METHOD_LABELS[method]).join(', ')}`
          : 'Selecione ao menos uma modalidade para continuar.'}
      </div>
    </div>
  );
}
