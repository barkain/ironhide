'use client';

import * as React from 'react';
import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartModal } from './ChartModal';

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  /** Content to render in expanded modal - can be ReactNode or render function for fresh rendering */
  expandedContent?: React.ReactNode | (() => React.ReactNode);
}

/**
 * Wrapper component that renders the expanded content.
 * By being a separate component, it ensures fresh rendering each time the modal opens.
 */
function ExpandedChartContent({
  expandedContent,
  fallback,
}: {
  expandedContent?: React.ReactNode | (() => React.ReactNode);
  fallback: React.ReactNode;
}) {
  // Resolve content - if it's a function, call it fresh each render
  if (!expandedContent) return <>{fallback}</>;
  if (typeof expandedContent === 'function') {
    return <>{expandedContent()}</>;
  }
  return <>{expandedContent}</>;
}

export function ChartCard({ title, children, expandedContent }: ChartCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          <button
            onClick={() => setIsExpanded(true)}
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
            aria-label="Expand chart"
          >
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {children}
          </div>
        </CardContent>
      </Card>

      <ChartModal
        open={isExpanded}
        onOpenChange={setIsExpanded}
        title={title}
      >
        <ExpandedChartContent expandedContent={expandedContent} fallback={children} />
      </ChartModal>
    </>
  );
}
