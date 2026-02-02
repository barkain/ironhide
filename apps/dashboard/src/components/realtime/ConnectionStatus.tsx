'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SSEConnectionStatus } from '@analytics/shared';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface ConnectionStatusProps {
  status: SSEConnectionStatus;
  onReconnect?: () => void;
}

export function ConnectionStatus({ status, onReconnect }: ConnectionStatusProps) {
  const statusConfig = {
    connected: {
      label: 'Live',
      variant: 'success' as const,
      icon: Wifi,
      pulse: true,
    },
    connecting: {
      label: 'Connecting',
      variant: 'warning' as const,
      icon: RefreshCw,
      pulse: false,
    },
    disconnected: {
      label: 'Disconnected',
      variant: 'secondary' as const,
      icon: WifiOff,
      pulse: false,
    },
    error: {
      label: 'Error',
      variant: 'destructive' as const,
      icon: WifiOff,
      pulse: false,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={config.variant}
        className={cn('flex items-center gap-1', config.pulse && 'animate-pulse')}
      >
        <Icon className={cn('h-3 w-3', status === 'connecting' && 'animate-spin')} />
        {config.label}
      </Badge>
      {(status === 'disconnected' || status === 'error') && onReconnect && (
        <Button variant="ghost" size="sm" onClick={onReconnect}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Reconnect
        </Button>
      )}
    </div>
  );
}

interface LiveIndicatorProps {
  isLive: boolean;
}

export function LiveIndicator({ isLive }: LiveIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
        )}
      />
      <span className="text-xs text-muted-foreground">
        {isLive ? 'Live' : 'Paused'}
      </span>
    </div>
  );
}
