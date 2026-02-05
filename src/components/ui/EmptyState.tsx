import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Card, CardContent } from './Card';
import { Button } from './Button';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  children,
}: EmptyStateProps) {
  return (
    <Card className={cn('', className)}>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-gray-800 p-4 mb-4">
          <Icon className="h-8 w-8 text-gray-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-300 mb-2">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500 text-center max-w-md mb-4">
            {description}
          </p>
        )}
        {children}
        {action && (
          <Button
            onClick={action.onClick}
            variant="secondary"
            size="sm"
            className="mt-4"
          >
            {action.icon && <action.icon className="h-4 w-4 mr-2" />}
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Inline variant for use within other components
interface InlineEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}

export function InlineEmptyState({
  icon: Icon,
  title,
  description,
  className,
}: InlineEmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-8 text-center', className)}>
      <Icon className="h-10 w-10 text-gray-600 mb-3" />
      <p className="text-sm font-medium text-gray-400">{title}</p>
      {description && (
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      )}
    </div>
  );
}
