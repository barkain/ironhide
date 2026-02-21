import { useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, FolderOpen, MessageSquare, Hash } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  isActive?: boolean;
}

interface DrillDownBreadcrumbProps {
  items?: BreadcrumbItem[];
  className?: string;
  onNavigateBack?: () => void;
}

/**
 * DrillDownBreadcrumb Component
 *
 * Provides hierarchical navigation through the dashboard:
 * Dashboard -> Sessions -> Session Detail -> Turn Detail
 *
 * Features:
 * - Click any breadcrumb level to navigate back
 * - Keyboard navigation (Escape to go back)
 * - URL-based routing support
 */
export function DrillDownBreadcrumb({ items, className, onNavigateBack }: DrillDownBreadcrumbProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Generate default breadcrumb items from current route
  const breadcrumbItems = items || generateBreadcrumbsFromPath(location.pathname, location.search);

  // Handle keyboard navigation - Escape to go back
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleGoBack();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [breadcrumbItems, navigate, onNavigateBack]);

  const handleGoBack = useCallback(() => {
    if (onNavigateBack) {
      onNavigateBack();
      return;
    }

    // Navigate to the previous breadcrumb if available
    const previousItem = breadcrumbItems[breadcrumbItems.length - 2];
    if (previousItem?.href) {
      navigate(previousItem.href);
    } else if (breadcrumbItems.length > 1) {
      navigate(-1);
    }
  }, [breadcrumbItems, navigate, onNavigateBack]);

  return (
    <nav
      className={cn(
        'flex items-center space-x-1 text-sm overflow-x-auto pb-1',
        className
      )}
      aria-label="Breadcrumb navigation"
    >
      <ol className="flex items-center space-x-1">
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1;
          const isClickable = !isLast && item.href;

          return (
            <li key={item.href || item.label} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="mx-1 h-4 w-4 text-gray-500 flex-shrink-0" />
              )}

              {isClickable ? (
                <Link
                  to={item.href!}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors',
                    'text-gray-400 hover:text-white hover:bg-gray-800/50',
                    'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]/50'
                  )}
                >
                  {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                  <span className="truncate max-w-[200px]">{item.label}</span>
                </Link>
              ) : (
                <span
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-md',
                    isLast
                      ? 'text-white font-medium bg-gray-800/30'
                      : 'text-gray-400'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                  <span className="truncate max-w-[200px]">{item.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Keyboard hint */}
      {breadcrumbItems.length > 1 && (
        <div className="ml-4 hidden sm:flex items-center text-xs text-gray-600">
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 font-mono">
            Esc
          </kbd>
          <span className="ml-1">to go back</span>
        </div>
      )}
    </nav>
  );
}

/**
 * Generate breadcrumb items from the current URL path
 */
function generateBreadcrumbsFromPath(pathname: string, search: string): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = [
    {
      label: 'Dashboard',
      href: '/',
      icon: <Home className="h-4 w-4" />,
    },
  ];

  const pathSegments = pathname.split('/').filter(Boolean);

  // Parse URL for different routes
  if (pathSegments[0] === 'sessions') {
    breadcrumbs.push({
      label: 'Sessions',
      href: '/sessions',
      icon: <FolderOpen className="h-4 w-4" />,
    });

    if (pathSegments[1]) {
      const sessionId = pathSegments[1];
      const shortId = sessionId.slice(0, 8);

      breadcrumbs.push({
        label: `Session ${shortId}...`,
        href: `/sessions/${sessionId}`,
        icon: <MessageSquare className="h-4 w-4" />,
      });

      // Check for turn-specific route
      if (pathSegments[2] === 'turns' && pathSegments[3]) {
        const turnNumber = pathSegments[3];
        breadcrumbs.push({
          label: `Turn #${turnNumber}`,
          href: `/sessions/${sessionId}/turns/${turnNumber}`,
          icon: <Hash className="h-4 w-4" />,
        });
      }

      // Check for query param based turn selection
      const params = new URLSearchParams(search);
      const turnParam = params.get('turn');
      if (turnParam && !pathSegments[2]) {
        breadcrumbs.push({
          label: `Turn #${turnParam}`,
          icon: <Hash className="h-4 w-4" />,
        });
      }
    }
  } else if (pathSegments[0] === 'compare') {
    breadcrumbs.push({
      label: 'Compare',
      href: '/compare',
      icon: <FolderOpen className="h-4 w-4" />,
    });
  } else if (pathSegments[0] === 'settings') {
    breadcrumbs.push({
      label: 'Settings',
      href: '/settings',
      icon: <FolderOpen className="h-4 w-4" />,
    });
  }

  return breadcrumbs;
}

/**
 * Custom hook to build deep link URLs for sharing
 */
export function useDeepLink() {
  const location = useLocation();

  const buildDeepLink = useCallback(
    (sessionId: string, turnNumber?: number): string => {
      const baseUrl = window.location.origin;

      if (turnNumber !== undefined) {
        // Option 1: Use route-based URL
        return `${baseUrl}/sessions/${sessionId}/turns/${turnNumber}`;

        // Option 2: Use query param based URL (uncomment if preferred)
        // return `${baseUrl}/sessions/${sessionId}?turn=${turnNumber}`;
      }

      return `${baseUrl}/sessions/${sessionId}`;
    },
    []
  );

  const copyDeepLink = useCallback(
    async (sessionId: string, turnNumber?: number): Promise<boolean> => {
      const link = buildDeepLink(sessionId, turnNumber);
      try {
        await navigator.clipboard.writeText(link);
        return true;
      } catch (err) {
        console.error('Failed to copy link:', err);
        return false;
      }
    },
    [buildDeepLink]
  );

  const getCurrentDeepLink = useCallback((): string => {
    return window.location.origin + location.pathname + location.search;
  }, [location]);

  return {
    buildDeepLink,
    copyDeepLink,
    getCurrentDeepLink,
  };
}

/**
 * Custom hook for programmatic navigation within the drill-down hierarchy
 */
export function useDrillDownNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const navigateToSession = useCallback(
    (sessionId: string) => {
      navigate(`/sessions/${sessionId}`);
    },
    [navigate]
  );

  const navigateToTurn = useCallback(
    (sessionId: string, turnNumber: number, useQueryParam = false) => {
      if (useQueryParam) {
        navigate(`/sessions/${sessionId}?turn=${turnNumber}`);
      } else {
        navigate(`/sessions/${sessionId}/turns/${turnNumber}`);
      }
    },
    [navigate]
  );

  const navigateBack = useCallback(() => {
    const pathSegments = location.pathname.split('/').filter(Boolean);

    // If viewing a turn, go back to session
    if (pathSegments[2] === 'turns' && pathSegments[1]) {
      navigate(`/sessions/${pathSegments[1]}`);
      return;
    }

    // If viewing a session, go back to sessions list
    if (pathSegments[0] === 'sessions' && pathSegments[1]) {
      navigate('/sessions');
      return;
    }

    // Otherwise, go to dashboard
    navigate('/');
  }, [location.pathname, navigate]);

  const parseCurrentLocation = useCallback(() => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const params = new URLSearchParams(location.search);

    const result: {
      level: 'dashboard' | 'sessions' | 'session' | 'turn';
      sessionId?: string;
      turnNumber?: number;
    } = { level: 'dashboard' };

    if (pathSegments[0] === 'sessions') {
      if (pathSegments[1]) {
        result.sessionId = pathSegments[1];
        result.level = 'session';

        if (pathSegments[2] === 'turns' && pathSegments[3]) {
          result.turnNumber = parseInt(pathSegments[3], 10);
          result.level = 'turn';
        } else if (params.has('turn')) {
          result.turnNumber = parseInt(params.get('turn')!, 10);
          result.level = 'turn';
        }
      } else {
        result.level = 'sessions';
      }
    }

    return result;
  }, [location]);

  return {
    navigateToSession,
    navigateToTurn,
    navigateBack,
    parseCurrentLocation,
  };
}

export default DrillDownBreadcrumb;
