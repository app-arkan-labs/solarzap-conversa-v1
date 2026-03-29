import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrencyBr } from '@/modules/internal-crm/components/InternalCrmUi';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

type RevenueBreakdownItem = {
  name: string;
  value_cents: number;
};

type RevenueBreakdownChartProps = {
  data: RevenueBreakdownItem[];
};

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#f97316'];

export function RevenueBreakdownChart(props: RevenueBreakdownChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Composicao de receita</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px]">
        {props.data.every((item) => Number(item.value_cents || 0) === 0) ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sem receita registrada para o periodo.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={props.data} dataKey="value_cents" nameKey="name" innerRadius={64} outerRadius={96} paddingAngle={2}>
                {props.data.map((item, index) => (
                  <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => [formatCurrencyBr(value), 'Valor']} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
