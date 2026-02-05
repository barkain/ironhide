import { Search, X } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface NoResultsEmptyProps {
  searchQuery?: string;
  onClearFilters?: () => void;
}

export function NoResultsEmpty({ searchQuery, onClearFilters }: NoResultsEmptyProps) {
  return (
    <EmptyState
      icon={Search}
      title="No results match your filters"
      description={
        searchQuery
          ? `No sessions found matching "${searchQuery}". Try adjusting your search term or clearing filters.`
          : 'No sessions match the current filters. Try adjusting or clearing your filters to see more results.'
      }
      action={
        onClearFilters
          ? {
              label: 'Clear Filters',
              onClick: onClearFilters,
              icon: X,
            }
          : undefined
      }
    />
  );
}
