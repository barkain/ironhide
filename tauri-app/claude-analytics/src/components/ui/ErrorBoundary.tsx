import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from './Card';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  onReset?: () => void;
  title?: string;
  description?: string;
}

export function ErrorFallback({
  error,
  onReset,
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Please try again.',
}: ErrorFallbackProps) {
  return (
    <Card className="border-red-800/50">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-red-900/30 p-4 mb-4">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-400 text-center max-w-md mb-4">
          {description}
        </p>
        {error && (
          <details className="mb-4 w-full max-w-md">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
              View error details
            </summary>
            <pre className="mt-2 p-3 rounded bg-gray-900 text-xs text-red-400 overflow-auto max-h-32">
              {error.message}
              {error.stack && (
                <>
                  {'\n\n'}
                  {error.stack}
                </>
              )}
            </pre>
          </details>
        )}
        {onReset && (
          <Button onClick={onReset} variant="secondary" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Hook-friendly error component for React Query errors
interface QueryErrorProps {
  error: Error | null;
  onRetry?: () => void;
  title?: string;
}

export function QueryError({ error, onRetry, title }: QueryErrorProps) {
  return (
    <ErrorFallback
      error={error}
      onReset={onRetry}
      title={title || 'Failed to load data'}
      description={
        error?.message || 'Unable to fetch the requested data. Please check your connection and try again.'
      }
    />
  );
}
