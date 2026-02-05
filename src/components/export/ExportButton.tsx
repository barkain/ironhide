import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '../ui/Button';
import { ExportDialog } from './ExportDialog';
import { exportSessions, exportTrends, type ExportOptions } from '../../lib/tauri';
import { cn } from '../../lib/utils';
import {
  Download,
  ChevronDown,
  FileJson,
  FileSpreadsheet,
  Settings,
  Check,
  AlertCircle,
  X,
} from 'lucide-react';

type ExportMode = 'sessions' | 'trends';

interface ExportButtonProps {
  sessionIds?: string[];
  mode?: ExportMode;
  className?: string;
  defaultDays?: number;
}

interface NotificationState {
  show: boolean;
  success: boolean;
  message: string;
}

export function ExportButton({
  sessionIds,
  mode = 'sessions',
  className,
  defaultDays = 30,
}: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notification, setNotification] = useState<NotificationState>({
    show: false,
    success: false,
    message: '',
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-hide notification after 5 seconds
  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification((prev) => ({ ...prev, show: false }));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification.show]);

  const showNotification = useCallback((success: boolean, message: string) => {
    setNotification({ show: true, success, message });
  }, []);

  const quickExport = useCallback(async (format: 'csv' | 'json') => {
    setIsOpen(false);
    setIsExporting(true);

    try {
      let filePath: string;

      if (mode === 'trends') {
        filePath = await exportTrends(defaultDays, format);
      } else {
        const options: ExportOptions = {
          format,
          include_turns: false,
          include_metrics: true,
        };
        filePath = await exportSessions(sessionIds, options);
      }

      showNotification(true, `Exported to: ${filePath}`);
    } catch (error) {
      showNotification(
        false,
        error instanceof Error ? error.message : 'Export failed'
      );
    } finally {
      setIsExporting(false);
    }
  }, [mode, sessionIds, defaultDays, showNotification]);

  const handleOpenDialog = useCallback(() => {
    setIsOpen(false);
    setShowDialog(true);
  }, []);

  return (
    <>
      <div className={cn('relative', className)} ref={dropdownRef}>
        <div className="flex">
          {/* Main button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            isLoading={isExporting}
            disabled={isExporting}
            className="rounded-r-none border-r-0"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>

          {/* Dropdown toggle */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            disabled={isExporting}
            className="rounded-l-none px-2"
          >
            <ChevronDown className={cn(
              'h-4 w-4 transition-transform',
              isOpen && 'rotate-180'
            )} />
          </Button>
        </div>

        {/* Dropdown menu */}
        {isOpen && (
          <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-gray-700 bg-[var(--color-surface)] py-1 shadow-xl z-50">
            <button
              onClick={() => quickExport('csv')}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 text-gray-400" />
              Export as CSV
            </button>
            <button
              onClick={() => quickExport('json')}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <FileJson className="h-4 w-4 text-gray-400" />
              Export as JSON
            </button>
            <div className="my-1 border-t border-gray-700" />
            <button
              onClick={handleOpenDialog}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <Settings className="h-4 w-4 text-gray-400" />
              Export with options...
            </button>
          </div>
        )}
      </div>

      {/* Export Dialog */}
      <ExportDialog
        isOpen={showDialog}
        onClose={() => setShowDialog(false)}
        sessionIds={sessionIds}
        mode={mode}
        defaultDays={defaultDays}
      />

      {/* Notification Toast */}
      {notification.show && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div
            className={cn(
              'flex items-start gap-3 rounded-lg border p-4 shadow-xl max-w-md',
              notification.success
                ? 'bg-green-900/90 border-green-700/50 backdrop-blur-sm'
                : 'bg-red-900/90 border-red-700/50 backdrop-blur-sm'
            )}
          >
            {notification.success ? (
              <Check className="h-5 w-5 text-green-400 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  'text-sm font-medium',
                  notification.success ? 'text-green-400' : 'text-red-400'
                )}
              >
                {notification.success ? 'Export Successful' : 'Export Failed'}
              </p>
              <p className="text-xs text-gray-300 mt-1 break-all">
                {notification.message}
              </p>
            </div>
            <button
              onClick={() => setNotification((prev) => ({ ...prev, show: false }))}
              className="text-gray-400 hover:text-white shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
