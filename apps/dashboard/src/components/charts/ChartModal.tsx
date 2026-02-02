'use client';

import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ChartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

export function ChartModal({ open, onOpenChange, title, children }: ChartModalProps) {
  // Track when chart should render (after modal is fully open and sized)
  const [isReady, setIsReady] = useState(false);
  // Force re-render key to ensure chart re-initializes with correct dimensions
  const [renderKey, setRenderKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // Reset ready state when opening
      setIsReady(false);

      // Use requestAnimationFrame to ensure DOM is painted and sized
      // Then wait a bit more for modal animation to complete
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setIsReady(true);
            // Increment render key to force fresh chart render
            setRenderKey(prev => prev + 1);
          });
        });
      }, 350); // Slightly longer delay to ensure animation completes

      return () => clearTimeout(timer);
    } else {
      setIsReady(false);
    }
  }, [open]);

  // Handle resize events to force chart re-render
  const handleResize = useCallback(() => {
    if (isReady) {
      setRenderKey(prev => prev + 1);
    }
  }, [isReady]);

  useEffect(() => {
    if (open && isReady) {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [open, isReady, handleResize]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div
          ref={containerRef}
          className="h-[70vh] min-h-[400px] w-full"
        >
          {/* Only render children when modal is fully ready with dimensions */}
          {isReady ? (
            <div key={renderKey} className="w-full h-full">
              {children}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading chart...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
