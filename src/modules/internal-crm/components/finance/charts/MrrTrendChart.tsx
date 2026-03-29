import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrencyBr } from '@/modules/internal-crm/components/InternalCrmUi';
import type { FinanceMonthlyMrrRow } from '@/modules/internal-crm/hooks/useInternalCrmFinance';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type MrrTrendChartProps = {
  data: FinanceMonthlyMrrRow[];
};

export function MrrTrendChart(props: MrrTrendChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tendencia de MRR</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px]">
        {props.data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sem historico de MRR para exibir.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={props.data} margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={84} tickFormatter={(value) => formatCurrencyBr(Number(value))} />
              <Tooltip formatter={(value: number) => [formatCurrencyBr(value), 'MRR']} />
              <Line type="monotone" dataKey="mrr_cents" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
