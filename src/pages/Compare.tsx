import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { SessionComparisonView } from '../components/comparison/SessionComparisonView';
import { useAppStore } from '../lib/store';

function Compare() {
  const { sessionIds } = useParams<{ sessionIds?: string }>();
  const { setSelectedForComparison } = useAppStore();

  // Parse session IDs from URL and set them as pre-selected
  useEffect(() => {
    if (sessionIds) {
      const ids = sessionIds.split(',').filter((id) => id.trim().length > 0);
      if (ids.length > 0) {
        setSelectedForComparison(ids);
      }
    }
  }, [sessionIds, setSelectedForComparison]);

  const initialIds = sessionIds?.split(',').filter((id) => id.trim().length > 0);

  return (
    <div className="flex flex-col">
      <Header
        title="Compare Sessions"
        subtitle="Compare metrics and efficiency across different sessions"
      />
      <div className="flex-1 p-6">
        <SessionComparisonView initialSessionIds={initialIds} />
      </div>
    </div>
  );
}

export default Compare;
