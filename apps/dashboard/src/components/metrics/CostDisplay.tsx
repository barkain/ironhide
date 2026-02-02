'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

interface CostDisplayProps {
  totalCost: number;
  costBreakdown?: {
    input: number;
    output: number;
    cacheCreation: number;
  };
  avgCostPerTurn?: number;
  showBreakdown?: boolean;
}

export function CostDisplay({
  totalCost,
  costBreakdown,
  avgCostPerTurn,
  showBreakdown = true,
}: CostDisplayProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-600" />
          Total Cost
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{formatCurrency(totalCost)}</p>

        {avgCostPerTurn !== undefined && (
          <p className="text-sm text-muted-foreground mt-1">
            {formatCurrency(avgCostPerTurn)} per turn avg
          </p>
        )}

        {showBreakdown && costBreakdown && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Input tokens</span>
              <span>{formatCurrency(costBreakdown.input)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Output tokens</span>
              <span>{formatCurrency(costBreakdown.output)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Cache creation</span>
              <span>{formatCurrency(costBreakdown.cacheCreation)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CostComparisonProps {
  currentCost: number;
  previousCost: number;
  label?: string;
}

export function CostComparison({
  currentCost,
  previousCost,
  label = 'vs previous',
}: CostComparisonProps) {
  const diff = currentCost - previousCost;
  const percentChange = previousCost > 0 ? (diff / previousCost) * 100 : 0;
  const isIncrease = diff > 0;

  return (
    <div className="flex items-center gap-2 text-sm">
      {isIncrease ? (
        <TrendingUp className="h-4 w-4 text-red-500" />
      ) : (
        <TrendingDown className="h-4 w-4 text-green-500" />
      )}
      <span className={isIncrease ? 'text-red-500' : 'text-green-500'}>
        {isIncrease ? '+' : ''}
        {formatCurrency(diff)} ({percentChange.toFixed(1)}%)
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
