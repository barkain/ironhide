import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/Card';

interface EfficiencyGaugeProps {
  value: number; // 0-100
  label: string;
  description?: string;
  isLoading?: boolean;
}

export function EfficiencyGauge({ value, label, description, isLoading }: EfficiencyGaugeProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{label}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-pulse text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const normalizedValue = Math.min(100, Math.max(0, value));
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference - (normalizedValue / 100) * circumference;

  // Color based on value
  let color = '#ef4444'; // red
  if (normalizedValue >= 75) {
    color = '#10b981'; // green
  } else if (normalizedValue >= 50) {
    color = '#f59e0b'; // yellow
  } else if (normalizedValue >= 25) {
    color = '#f97316'; // orange
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-4">
        <div className="relative h-32 w-32">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="8"
            />
            {/* Progress circle */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{
                transition: 'stroke-dashoffset 0.5s ease-in-out',
              }}
            />
          </svg>
          {/* Value in center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">
              {normalizedValue.toFixed(1)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
