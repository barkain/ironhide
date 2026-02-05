import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { formatCurrency } from '../../lib/utils';
import type { ProjectMetrics } from '../../types';

interface CostChartProps {
  data: ProjectMetrics[];
  isLoading?: boolean;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function CostChart({ data, isLoading }: CostChartProps) {
  if (isLoading) {
    return (
      <Card className="h-80">
        <CardHeader>
          <CardTitle>Cost by Project</CardTitle>
        </CardHeader>
        <CardContent className="flex h-56 items-center justify-center">
          <div className="animate-pulse text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="h-80">
        <CardHeader>
          <CardTitle>Cost by Project</CardTitle>
        </CardHeader>
        <CardContent className="flex h-56 items-center justify-center">
          <div className="text-gray-500">No data available</div>
        </CardContent>
      </Card>
    );
  }

  // Take top 6 projects by cost
  const chartData = data
    .sort((a, b) => b.total_cost - a.total_cost)
    .slice(0, 6)
    .map((d) => ({
      name: d.project_name,
      fullPath: d.project_path,
      cost: d.total_cost,
      sessions: d.session_count,
    }));

  return (
    <Card className="h-80">
      <CardHeader>
        <CardTitle>Cost by Project</CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" horizontal={true} vertical={false} />
            <XAxis
              type="number"
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              tickFormatter={(value) => formatCurrency(value)}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              width={100}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1c',
                border: '1px solid #2a2a2e',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#fff' }}
              formatter={(value, _name, props) => {
                if (value === undefined) return ['', ''];
                const formattedValue = formatCurrency(value as number);
                const sessions = props.payload?.sessions;
                return [
                  <span key="value">
                    {formattedValue}
                    {sessions !== undefined && (
                      <span className="text-gray-400 ml-2">({sessions} session{sessions !== 1 ? 's' : ''})</span>
                    )}
                  </span>,
                  'Cost',
                ];
              }}
              labelFormatter={(label, payload) =>
                payload?.[0]?.payload?.fullPath || label
              }
            />
            <Bar dataKey="cost" name="Cost" radius={[0, 4, 4, 0]}>
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
