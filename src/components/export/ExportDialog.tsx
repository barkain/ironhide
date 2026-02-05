import { useState, useCallback } from 'react';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { exportSessions, exportTrends, type ExportOptions } from '../../lib/tauri';
import { cn } from '../../lib/utils';
import {
  X,
  Download,
  FileJson,
  FileSpreadsheet,
  Check,
  AlertCircle,
  Calendar,
  Settings,
} from 'lucide-react';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionIds?: string[];
  mode?: 'sessions' | 'trends';
  defaultDays?: number;
}

export function ExportDialog({
  isOpen,
  onClose,
  sessionIds,
  mode = 'sessions',
  defaultDays = 30,
}: ExportDialogProps) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [includeTurns, setIncludeTurns] = useState(false);
  const [includeMetrics, setIncludeMetrics] = useState(true);
  const [useDateRange, setUseDateRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [trendDays, setTrendDays] = useState(defaultDays);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ success: boolean; path?: string; error?: string } | null>(null);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportResult(null);

    try {
      let filePath: string;

      if (mode === 'trends') {
        filePath = await exportTrends(trendDays, format);
      } else {
        const options: ExportOptions = {
          format,
          include_turns: includeTurns,
          include_metrics: includeMetrics,
          date_range: useDateRange && startDate && endDate
            ? [startDate, endDate]
            : undefined,
        };
        filePath = await exportSessions(sessionIds, options);
      }

      setExportResult({ success: true, path: filePath });
    } catch (error) {
      setExportResult({
        success: false,
        error: error instanceof Error ? error.message : 'Export failed',
      });
    } finally {
      setIsExporting(false);
    }
  }, [mode, format, includeTurns, includeMetrics, useDateRange, startDate, endDate, sessionIds, trendDays]);

  const handleClose = useCallback(() => {
    setExportResult(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <Card className="relative z-10 w-full max-w-md mx-4 shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-700 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[var(--color-primary-600)]/20 p-2">
              <Download className="h-5 w-5 text-[var(--color-primary-400)]" />
            </div>
            <CardTitle>
              {mode === 'trends' ? 'Export Trends' : 'Export Sessions'}
            </CardTitle>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Success/Error Message */}
          {exportResult && (
            <div
              className={cn(
                'flex items-start gap-3 rounded-lg p-4',
                exportResult.success
                  ? 'bg-green-900/30 border border-green-700/50'
                  : 'bg-red-900/30 border border-red-700/50'
              )}
            >
              {exportResult.success ? (
                <Check className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'font-medium',
                  exportResult.success ? 'text-green-400' : 'text-red-400'
                )}>
                  {exportResult.success ? 'Export Successful!' : 'Export Failed'}
                </p>
                <p className="text-sm text-gray-400 mt-1 break-all">
                  {exportResult.success
                    ? exportResult.path
                    : exportResult.error}
                </p>
              </div>
            </div>
          )}

          {/* Format Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-300">
              Export Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFormat('csv')}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-4 transition-all',
                  format === 'csv'
                    ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-600)]/10'
                    : 'border-gray-700 hover:border-gray-600'
                )}
              >
                <FileSpreadsheet className={cn(
                  'h-5 w-5',
                  format === 'csv' ? 'text-[var(--color-primary-400)]' : 'text-gray-400'
                )} />
                <div className="text-left">
                  <p className={cn(
                    'font-medium',
                    format === 'csv' ? 'text-white' : 'text-gray-300'
                  )}>CSV</p>
                  <p className="text-xs text-gray-500">Spreadsheet format</p>
                </div>
              </button>
              <button
                onClick={() => setFormat('json')}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-4 transition-all',
                  format === 'json'
                    ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-600)]/10'
                    : 'border-gray-700 hover:border-gray-600'
                )}
              >
                <FileJson className={cn(
                  'h-5 w-5',
                  format === 'json' ? 'text-[var(--color-primary-400)]' : 'text-gray-400'
                )} />
                <div className="text-left">
                  <p className={cn(
                    'font-medium',
                    format === 'json' ? 'text-white' : 'text-gray-300'
                  )}>JSON</p>
                  <p className="text-xs text-gray-500">Structured format</p>
                </div>
              </button>
            </div>
          </div>

          {/* Trends-specific options */}
          {mode === 'trends' && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-300">
                Time Period (days)
              </label>
              <div className="flex items-center gap-3">
                {[7, 14, 30, 60, 90].map((days) => (
                  <button
                    key={days}
                    onClick={() => setTrendDays(days)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm transition-colors',
                      trendDays === days
                        ? 'bg-[var(--color-primary-600)] text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    )}
                  >
                    {days}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sessions-specific options */}
          {mode === 'sessions' && (
            <>
              {/* Export Options */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-gray-400" />
                  <label className="text-sm font-medium text-gray-300">
                    Options
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeTurns}
                      onChange={(e) => setIncludeTurns(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-[var(--color-primary-500)] focus:ring-[var(--color-primary-500)] focus:ring-offset-0"
                    />
                    <span className="text-sm text-gray-300">Include turn details</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeMetrics}
                      onChange={(e) => setIncludeMetrics(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-[var(--color-primary-500)] focus:ring-[var(--color-primary-500)] focus:ring-offset-0"
                    />
                    <span className="text-sm text-gray-300">Include efficiency metrics</span>
                  </label>
                </div>
              </div>

              {/* Date Range Filter */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDateRange}
                    onChange={(e) => setUseDateRange(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-[var(--color-primary-500)] focus:ring-[var(--color-primary-500)] focus:ring-offset-0"
                  />
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-300">Filter by date range</span>
                  </div>
                </label>

                {useDateRange && (
                  <div className="grid grid-cols-2 gap-3 ml-7">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Start Date</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-[var(--color-primary-500)] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">End Date</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-[var(--color-primary-500)] focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Selection Info */}
              {sessionIds && sessionIds.length > 0 && (
                <div className="rounded-lg bg-gray-800 p-3 text-sm text-gray-400">
                  Exporting {sessionIds.length} selected session{sessionIds.length !== 1 ? 's' : ''}
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleExport}
              isLoading={isExporting}
              disabled={isExporting}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
