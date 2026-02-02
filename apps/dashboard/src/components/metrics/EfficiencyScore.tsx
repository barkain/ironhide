'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatPercent } from '@/lib/utils';
import { Zap } from 'lucide-react';
import type { EfficiencyComponents } from '@analytics/shared';

interface EfficiencyScoreProps {
  efficiency: EfficiencyComponents;
}

export function EfficiencyScore({ efficiency }: EfficiencyScoreProps) {
  const { compositeScore, cacheUtilization, toolSuccessRate, contextEfficiency } = efficiency;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Improvement';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          Efficiency Score
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-4">
          <p className="text-4xl font-bold">{compositeScore.toFixed(0)}</p>
          <div>
            <p className="text-sm font-medium">{getScoreLabel(compositeScore)}</p>
            <Progress
              value={compositeScore}
              className="w-32 h-2"
              indicatorClassName={getScoreColor(compositeScore)}
            />
          </div>
        </div>

        <div className="space-y-3">
          <EfficiencyMetric
            label="Cache Utilization"
            value={cacheUtilization}
            description="How effectively cache is being used"
          />
          <EfficiencyMetric
            label="Tool Success Rate"
            value={toolSuccessRate}
            description="Percentage of successful tool calls"
          />
          <EfficiencyMetric
            label="Context Efficiency"
            value={contextEfficiency}
            description="Output per context window used"
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface EfficiencyMetricProps {
  label: string;
  value: number;
  description: string;
}

function EfficiencyMetric({ label, value, description }: EfficiencyMetricProps) {
  const getColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="font-medium">{formatPercent(value)}</span>
      </div>
      <Progress value={value} className="h-1.5" indicatorClassName={getColor(value)} />
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}
