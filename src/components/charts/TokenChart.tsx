import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { formatCompactNumber } from '../../lib/utils';
import type { DailyMetrics } from '../../types';

interface TokenChartProps {
  data: DailyMetrics[];
  isLoading?: boolean;
}

export function TokenChart({ data, isLoading }: TokenChartProps) {
  if (isLoading) {
    return (
      <Card className="h-80">
        <CardHeader>
          <CardTitle>Token Usage Over Time</CardTitle>
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
          <CardTitle>Token Usage Over Time</CardTitle>
        </CardHeader>
        <CardContent className="flex h-56 items-center justify-center">
          <div className="text-gray-500">No data available</div>
        </CardContent>
      </Card>
    );
  }

  // Sort by date and take last 30 days
  const sortedData = [...data]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const chartData = sortedData.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    tokens: d.total_tokens,
    sessions: d.session_count,
    turns: d.total_turns,
  }));

  return (
    <Card className="h-80">
      <CardHeader>
        <CardTitle>Token Usage Over Time</CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="tokensGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="turnsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
            <XAxis
              dataKey="date"
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              tickFormatter={(value) => formatCompactNumber(value)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1c',
                border: '1px solid #2a2a2e',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#fff' }}
              formatter={(value, name) => {
                if (value === undefined) return ['', name];
                const formattedValue = formatCompactNumber(value as number);
                const label = name === 'tokens' ? 'Tokens' : name === 'turns' ? 'Turns' : String(name);
                return [formattedValue, label];
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="tokens"
              name="Tokens"
              stroke="#3b82f6"
              fill="url(#tokensGradient)"
            />
            <Area
              type="monotone"
              dataKey="turns"
              name="Turns"
              stroke="#10b981"
              fill="url(#turnsGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
