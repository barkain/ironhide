'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Maximize2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartModal } from './ChartModal';
import { formatPercent } from '@/lib/utils';

interface ContextUsageGaugeProps {
  value: number; // 0-100
  label?: string;
}

function GaugeChart({ value }: { value: number }) {
  const data = [
    { name: 'used', value: value },
    { name: 'remaining', value: 100 - value },
  ];

  const getColor = (percentage: number) => {
    if (percentage < 50) return 'hsl(var(--chart-2))'; // Green
    if (percentage < 80) return 'hsl(var(--chart-4))'; // Yellow
    return 'hsl(var(--destructive))'; // Red
  };

  return (
    <div className="h-full relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            startAngle={180}
            endAngle={0}
            innerRadius={60}
            outerRadius={80}
            paddingAngle={0}
            dataKey="value"
          >
            <Cell fill={getColor(value)} />
            <Cell fill="hsl(var(--muted))" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center -mt-4">
          <p className="text-3xl font-bold">{formatPercent(value)}</p>
          <p className="text-sm text-muted-foreground">of context window</p>
        </div>
      </div>
    </div>
  );
}

export function ContextUsageGauge({ value, label = 'Context Usage' }: ContextUsageGaugeProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg">{label}</CardTitle>
          <button
            onClick={() => setIsExpanded(true)}
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
            aria-label="Expand chart"
          >
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <GaugeChart value={value} />
          </div>
        </CardContent>
      </Card>

      <ChartModal
        open={isExpanded}
        onOpenChange={setIsExpanded}
        title={label}
      >
        <GaugeChart value={value} />
      </ChartModal>
    </>
  );
}
