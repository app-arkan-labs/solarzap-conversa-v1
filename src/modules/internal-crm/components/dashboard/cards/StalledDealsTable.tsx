import { Handshake } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TokenBadge, formatCurrencyBr, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmDealSummary } from '@/modules/internal-crm/types';

type StalledDealsTableProps = {
  deals: InternalCrmDealSummary[];
};

export function StalledDealsTable(props: StalledDealsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Handshake className="h-4 w-4 text-primary" />
          Deals parados por etapa
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Última atualização</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.deals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nenhum deal parado no período.
                </TableCell>
              </TableRow>
            ) : (
              props.deals.map((deal) => (
                <TableRow key={deal.id}>
                  <TableCell className="font-medium">{deal.title}</TableCell>
                  <TableCell><TokenBadge token={deal.stage_code} label={deal.stage_code} /></TableCell>
                  <TableCell>{formatCurrencyBr((deal.one_time_total_cents || 0) + (deal.mrr_cents || 0))}</TableCell>
                  <TableCell>{formatDateTime(deal.updated_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
