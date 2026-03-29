import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TokenBadge, formatCurrencyBr, formatDateOnly } from '@/modules/internal-crm/components/InternalCrmUi';
import type { FinancePendingPaymentRow } from '@/modules/internal-crm/hooks/useInternalCrmFinance';

type PendingPaymentsTableProps = {
  rows: FinancePendingPaymentRow[];
};

export function PendingPaymentsTable(props: PendingPaymentsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Pagamentos pendentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Origem</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sem pendencias no momento.
                </TableCell>
              </TableRow>
            ) : (
              props.rows.map((row) => (
                <TableRow key={`${row.source}-${row.id}`}>
                  <TableCell className="capitalize">{row.source}</TableCell>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell>
                    <TokenBadge token={row.status} />
                  </TableCell>
                  <TableCell>{formatCurrencyBr(row.amount_cents)}</TableCell>
                  <TableCell>{formatDateOnly(row.reference_date)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
