import React from 'react';
import { Mic, X, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecordingState } from '@/hooks/useHoldToRecord';

interface MobileRecordingOverlayProps {
  state: RecordingState;
  durationSeconds: number;
  cancelRatio: number;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MobileRecordingOverlay({ state, durationSeconds, cancelRatio }: MobileRecordingOverlayProps) {
  if (state === 'idle' || state === 'pressing') return null;

  const isCanceling = state === 'canceling' || cancelRatio > 0.6;

  return (
    <div className="flex items-center gap-3 w-full px-4 py-3 bg-card border-t border-border animate-in fade-in-0 duration-150">
      {/* Cancel hint */}
      <div className={cn(
        "flex items-center gap-1 transition-colors",
        isCanceling ? "text-destructive" : "text-muted-foreground"
      )}>
        <ArrowLeft className="w-4 h-4" />
        <span className="text-xs whitespace-nowrap">
          {isCanceling ? 'Solte para cancelar' : 'Deslize para cancelar'}
        </span>
      </div>

      <div className="flex-1" />

      {/* Recording indicator */}
      <div className="flex items-center gap-2">
        <div className={cn(
          "w-2.5 h-2.5 rounded-full animate-pulse",
          isCanceling ? "bg-destructive" : "bg-red-500"
        )} />
        <span className={cn(
          "text-sm font-medium tabular-nums",
          isCanceling ? "text-destructive" : "text-foreground"
        )}>
          {formatTime(durationSeconds)}
        </span>
      </div>

      {/* Mic icon indicator */}
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
        isCanceling ? "bg-destructive/20" : "bg-destructive"
      )}>
        {isCanceling ? (
          <X className="w-5 h-5 text-destructive" />
        ) : (
          <Mic className="w-5 h-5 text-white" />
        )}
      </div>
    </div>
  );
}
