import { useMemo, useState } from 'react';
import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { InternalCrmStage } from '@/modules/internal-crm/types';

const STAGE_COLORS: Record<string, string> = {
  sky: '#0ea5e9',
  amber: '#f59e0b',
  indigo: '#6366f1',
  cyan: '#06b6d4',
  rose: '#f43f5e',
  orange: '#f97316',
  emerald: '#10b981',
  zinc: '#71717a',
  violet: '#8b5cf6',
  blue: '#3b82f6',
  yellow: '#eab308',
};

type PipelineMovementChartProps = {
  data: Array<{ date: string; stage_code: string; count: number }>;
  stages: InternalCrmStage[];
};

export function PipelineMovementChart({ data, stages }: PipelineMovementChartProps) {
  const [selectedStages, setSelectedStages] = useState<Set<string>>(
    () => new Set(stages.map((s) => s.stage_code)),
  );

  const toggleStage = (stageCode: string) => {
    setSelectedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageCode)) next.delete(stageCode);
      else next.add(stageCode);
      return next;
    });
  };

  // Pivot data to { date, novo_lead: 3, respondeu: 1, ... }
  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();
    for (const row of data) {
      if (!dateMap.has(row.date)) dateMap.set(row.date, {});
      const entry = dateMap.get(row.date)!;
      entry[row.stage_code] = (entry[row.stage_code] || 0) + row.count;
    }
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));
  }, [data]);

  const stageColor = (stage: InternalCrmStage) =>
    STAGE_COLORS[stage.color_token || 'zinc'] || '#71717a';

  if (stages.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          Movimentação da Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Stage multi-select */}
        <div className="mb-4 flex flex-wrap gap-2">
          {stages.map((stage) => (
            <button
              key={stage.stage_code}
              type="button"
              onClick={() => toggleStage(stage.stage_code)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selectedStages.has(stage.stage_code)
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-muted/50 text-muted-foreground',
              )}
            >
              {stage.name}
            </button>
          ))}
        </div>

        {chartData.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma movimentação no período selecionado.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {stages
                .filter((s) => selectedStages.has(s.stage_code))
                .map((stage) => (
                  <Line
                    key={stage.stage_code}
                    type="monotone"
                    dataKey={stage.stage_code}
                    name={stage.name}
                    stroke={stageColor(stage)}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
