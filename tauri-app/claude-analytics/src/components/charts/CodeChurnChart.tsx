import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { formatCompactNumber } from '../../lib/utils';

interface CodeChurnData {
  turn: number;
  added: number;
  removed: number;
}

interface CodeChurnChartProps {
  data: CodeChurnData[];
  isLoading?: boolean;
  title?: string;
}

export function CodeChurnChart({ data, isLoading, title = 'Code Churn by Turn' }: CodeChurnChartProps) {
  if (isLoading) {
    return (
      <Card className="h-80">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
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
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex h-56 items-center justify-center">
          <div className="text-gray-500">No code changes recorded</div>
        </CardContent>
      </Card>
    );
  }

  // Transform data to have removed as negative for diverging bar chart
  const chartData = data.map((d) => ({
    turn: d.turn,
    added: d.added,
    removed: -Math.abs(d.removed), // Ensure removed is negative
    net: d.added - Math.abs(d.removed),
    rawAdded: d.added,
    rawRemoved: Math.abs(d.removed),
  }));

  // Calculate domain for symmetrical Y-axis if needed
  const maxAdded = Math.max(...chartData.map((d) => d.added));
  const maxRemoved = Math.max(...chartData.map((d) => Math.abs(d.removed)));
  const maxValue = Math.max(maxAdded, maxRemoved);
  const yDomain = [-maxValue * 1.1, maxValue * 1.1];

  return (
    <Card className="h-80">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
            <XAxis
              dataKey="turn"
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              label={{ value: 'Turn', position: 'insideBottom', offset: -5, fill: '#6b7280', fontSize: 11 }}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              domain={yDomain}
              tickFormatter={(value) => formatCompactNumber(Math.abs(value))}
              label={{ value: 'Lines', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1c',
                border: '1px solid #2a2a2e',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#fff' }}
              labelFormatter={(label) => `Turn ${label}`}
              formatter={(_value, name, props) => {
                const payload = props.payload;
                if (name === 'added') {
                  return [`+${formatCompactNumber(payload.rawAdded)} lines`, 'Added'];
                }
                if (name === 'removed') {
                  return [`-${formatCompactNumber(payload.rawRemoved)} lines`, 'Removed'];
                }
                return [String(_value), String(name)];
              }}
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                const data = payload[0]?.payload;
                if (!data) return null;

                const netChange = data.net;
                const netColor = netChange >= 0 ? '#10b981' : '#ef4444';
                const netSign = netChange >= 0 ? '+' : '';

                return (
                  <div className="bg-[#1a1a1c] border border-[#2a2a2e] rounded-lg p-3 shadow-lg">
                    <p className="text-white font-medium mb-2">Turn {label}</p>
                    <div className="space-y-1 text-sm">
                      <p className="text-[#10b981]">
                        +{formatCompactNumber(data.rawAdded)} lines added
                      </p>
                      <p className="text-[#ef4444]">
                        -{formatCompactNumber(data.rawRemoved)} lines removed
                      </p>
                      <div className="border-t border-[#2a2a2e] pt-1 mt-1">
                        <p style={{ color: netColor }}>
                          Net: {netSign}{formatCompactNumber(netChange)} lines
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
            <Bar dataKey="added" name="added" stackId="stack" radius={[4, 4, 0, 0]}>
              {chartData.map((_, index) => (
                <Cell key={`added-${index}`} fill="#10b981" />
              ))}
            </Bar>
            <Bar dataKey="removed" name="removed" stackId="stack" radius={[0, 0, 4, 4]}>
              {chartData.map((_, index) => (
                <Cell key={`removed-${index}`} fill="#ef4444" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
