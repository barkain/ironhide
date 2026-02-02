'use client';

import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InfoTooltipProps {
  content: string;
  className?: string;
}

export function InfoTooltip({ content, className }: InfoTooltipProps) {
  return (
    <span className={cn('relative inline-flex items-center group', className)}>
      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 text-xs text-popover-foreground bg-popover border rounded-md shadow-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-normal w-64 z-50 pointer-events-none">
        {content}
      </span>
    </span>
  );
}
