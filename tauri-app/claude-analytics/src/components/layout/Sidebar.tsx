import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  GitCompare,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../lib/store';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, selectedForComparison } = useAppStore();

  const navItems: NavItem[] = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/sessions', icon: History, label: 'Sessions' },
    {
      to: selectedForComparison.length > 0
        ? `/compare/${selectedForComparison.join(',')}`
        : '/compare',
      icon: GitCompare,
      label: 'Compare',
      badge: selectedForComparison.length > 0 ? selectedForComparison.length : undefined,
    },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-[var(--color-border)] px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary-600)]">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          {!sidebarCollapsed && (
            <span className="font-semibold text-white">Claude Analytics</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.label}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors relative',
                    isActive
                      ? 'bg-[var(--color-primary-600)]/20 text-[var(--color-primary-400)]'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  )
                }
              >
                <div className="relative">
                  <item.icon className="h-5 w-5 shrink-0" />
                  {item.badge !== undefined && sidebarCollapsed && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-primary-500)] text-[10px] font-bold text-white">
                      {item.badge}
                    </span>
                  )}
                </div>
                {!sidebarCollapsed && (
                  <>
                    <span>{item.label}</span>
                    {item.badge !== undefined && (
                      <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--color-primary-500)] px-1.5 text-xs font-bold text-white">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-[var(--color-border)] p-4">
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5 mr-2" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
