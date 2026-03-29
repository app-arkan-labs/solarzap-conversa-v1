import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TokenBadge, formatCurrencyBr, formatDateOnly } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmFinanceSummary } from '@/modules/internal-crm/types';

type SubscriptionsTableProps = {
  subscriptions: InternalCrmFinanceSummary['subscriptions'];
};

export function SubscriptionsTable(props: SubscriptionsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Subscriptions</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>MRR</TableHead>
              <TableHead>Ciclo</TableHead>
              <TableHead>Renovacao</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.subscriptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhuma subscription interna registrada.
                </TableCell>
              </TableRow>
            ) : (
              props.subscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell className="font-medium">{subscription.product_code || '-'}</TableCell>
                  <TableCell>
                    <TokenBadge token={subscription.status} />
                  </TableCell>
                  <TableCell>{formatCurrencyBr(subscription.mrr_cents)}</TableCell>
                  <TableCell>{subscription.billing_interval || '-'}</TableCell>
                  <TableCell>{formatDateOnly(subscription.current_period_end)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
