'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { ChartCard } from './ChartCard';
import { formatNumber } from '@/lib/utils';

interface ToolUsageChartProps {
  toolBreakdown: Record<string, number>;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(220 70% 50%)',
  'hsl(160 60% 45%)',
  'hsl(30 80% 55%)',
];

interface ChartDataPoint {
  name: string;
  value: number;
}

function ToolUsagePieChart({ data, total }: { data: ChartDataPoint[]; total: number }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) =>
            percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''
          }
          labelLine={false}
        >
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 'var(--radius)',
            color: 'hsl(var(--foreground))',
          }}
          itemStyle={{
            color: 'hsl(var(--foreground))',
          }}
          formatter={(value: number, name: string) => [
            `${formatNumber(value)} (${((value / total) * 100).toFixed(1)}%)`,
            name,
          ]}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          formatter={(value) => <span className="text-sm">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ToolUsageChart({ toolBreakdown }: ToolUsageChartProps) {
  const data: ChartDataPoint[] = Object.entries(toolBreakdown)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8); // Show top 8 tools

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <ChartCard title="Tool Usage">
      <ToolUsagePieChart data={data} total={total} />
    </ChartCard>
  );
}
