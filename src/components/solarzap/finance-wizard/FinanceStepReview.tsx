import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FinanceWizardStep, PAYMENT_METHOD_LABELS, PaymentMethod, SaleInstallmentInput } from '@/types/finance';

interface FinanceStepReviewProps {
  saleValue: number;
  projectCost: number;
  marginValue: number;
  marginPct: number;
  notes: string;
  selectedMethods: PaymentMethod[];
  installments: SaleInstallmentInput[];
  formatCurrency: (value: number) => string;
  onEditStep: (step: Exclude<FinanceWizardStep, 4>) => void;
}

function EditCardHeader({
  title,
  description,
  onEdit,
}: {
  title: string;
  description: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
        Editar
      </Button>
    </div>
  );
}

export function FinanceStepReview({
  saleValue,
  projectCost,
  marginValue,
  marginPct,
  notes,
  selectedMethods,
  installments,
  formatCurrency,
  onEditStep,
}: FinanceStepReviewProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <EditCardHeader
            title="Valores"
            description="Venda, custo e lucro projetado."
            onEdit={() => onEditStep(1)}
          />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Venda</p>
            <p className="mt-1 text-lg font-semibold">{formatCurrency(saleValue)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Custo</p>
            <p className="mt-1 text-lg font-semibold">{formatCurrency(projectCost)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Lucro</p>
            <p className="mt-1 text-lg font-semibold">
              {formatCurrency(marginValue)} ({marginPct.toFixed(2)}%)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <EditCardHeader
            title="Pagamento"
            description="Modalidades selecionadas como padrão."
            onEdit={() => onEditStep(2)}
          />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {selectedMethods.map((method) => (
            <Badge key={method}>{PAYMENT_METHOD_LABELS[method]}</Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <EditCardHeader
            title="Parcelas"
            description="Resumo compacto da estrutura de recebimento."
            onEdit={() => onEditStep(3)}
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="hidden grid-cols-[0.7fr_1fr_1fr_1.4fr] gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground md:grid">
            <div>Parcela</div>
            <div>Valor</div>
            <div>Vencimento</div>
            <div>Modalidade</div>
          </div>

          {installments.map((installment) => (
            <div
              key={`review-${installment.installment_no}-${installment.due_on}`}
              className="grid gap-2 rounded-lg border px-3 py-3 text-sm md:grid-cols-[0.7fr_1fr_1fr_1.4fr] md:items-center"
            >
              <div className="font-medium">#{installment.installment_no}</div>
              <div>{formatCurrency(installment.amount)}</div>
              <div>{installment.due_on}</div>
              <div className="flex flex-wrap gap-1">
                {installment.payment_methods.map((method) => (
                  <Badge key={`${installment.installment_no}-${method}`} variant="secondary">
                    {PAYMENT_METHOD_LABELS[method]}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <EditCardHeader
            title="Observações"
            description="Notas internas vinculadas ao fechamento."
            onEdit={() => onEditStep(1)}
          />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {notes.trim() || 'Nenhuma observação financeira registrada.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
