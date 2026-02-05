import { BarChart3, Calendar } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface NoDataEmptyProps {
  dateRange?: string;
  onChangeDateRange?: () => void;
}

export function NoDataEmpty({ dateRange, onChangeDateRange }: NoDataEmptyProps) {
  return (
    <EmptyState
      icon={BarChart3}
      title="No data for selected range"
      description={
        dateRange
          ? `There's no activity data for ${dateRange}. Try selecting a different date range to view your analytics.`
          : "There's no activity data for the selected time period. Try adjusting your date range."
      }
      action={
        onChangeDateRange
          ? {
              label: 'Change Date Range',
              onClick: onChangeDateRange,
              icon: Calendar,
            }
          : undefined
      }
    />
  );
}
