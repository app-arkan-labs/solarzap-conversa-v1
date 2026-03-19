import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { GuidedTourStep } from '@/components/onboarding/tourSteps';
import {
  getGuidedTourStepDelayMs,
  resolveGuidedTourTargetElement,
} from '@/lib/guidedTourTargets';

type GuidedTourProps = {
  showWelcome: boolean;
  running: boolean;
  steps: GuidedTourStep[];
  stepIndex: number;
  welcomeTitle: string;
  welcomeDescription: string;
  onStart: () => void;
  onSkip: () => void;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
};

type Box = { top: number; left: number; width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export default function GuidedTour({
  showWelcome,
  running,
  steps,
  stepIndex,
  welcomeTitle,
  welcomeDescription,
  onStart,
  onSkip,
  onClose,
  onNext,
  onPrev,
}: GuidedTourProps) {
  const step = steps[stepIndex];
  const [targetBox, setTargetBox] = useState<Box | null>(null);
  const [isTargetMissing, setIsTargetMissing] = useState(false);

  useEffect(() => {
    if (!running || !step) {
      setTargetBox(null);
      setIsTargetMissing(false);
      return;
    }

    let disposed = false;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const maxRetries = 4;
    const retryDelayMs = 220;

    const update = (attempt = 0) => {
      if (disposed) return;
      const element = resolveGuidedTourTargetElement(step);
      if (!element) {
        setTargetBox(null);
        if (attempt < maxRetries) {
          retryTimeoutId = setTimeout(() => update(attempt + 1), retryDelayMs);
        } else {
          setIsTargetMissing(true);
        }
        return;
      }

      setIsTargetMissing(false);
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

      const rect = element.getBoundingClientRect();
      setTargetBox({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    const handleResizeScroll = () => {
      update(0);
    };

    const timeoutId = setTimeout(() => update(0), getGuidedTourStepDelayMs(step));
    window.addEventListener('resize', handleResizeScroll);
    window.addEventListener('scroll', handleResizeScroll, true);

    return () => {
      disposed = true;
      clearTimeout(timeoutId);
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
      window.removeEventListener('resize', handleResizeScroll);
      window.removeEventListener('scroll', handleResizeScroll, true);
    };
  }, [running, step]);

  const tooltipStyle = useMemo(() => {
    const maxWidth = Math.min(360, window.innerWidth - 24);
    if (!targetBox) {
      const centeredLeft = window.innerWidth / 2 - maxWidth / 2;
      return {
        top: 24,
        left: clamp(centeredLeft, 12, window.innerWidth - maxWidth - 12),
        width: maxWidth,
      };
    }

    const preferredTop = targetBox.top + targetBox.height + 12;
    const fallbackTop = Math.max(12, targetBox.top - 220);
    const top = preferredTop + 220 < window.innerHeight ? preferredTop : fallbackTop;
    const left = clamp(targetBox.left, 12, window.innerWidth - maxWidth - 12);
    return { top, left, width: maxWidth };
  }, [targetBox]);

  return (
    <>
      <Dialog open={showWelcome} onOpenChange={(open) => { if (!open) onSkip(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{welcomeTitle}</DialogTitle>
            <DialogDescription>{welcomeDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onSkip}>Pular tour</Button>
            <Button type="button" onClick={onStart}>Iniciar tour</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {running && step ? (
        <div className="pointer-events-none fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-black/45 dark:bg-slate-950/60" />

          {targetBox ? (
            <div
              className="absolute rounded-xl border-2 border-primary shadow-[0_0_0_9999px_rgba(15,23,42,0.52)] dark:shadow-[0_0_0_9999px_rgba(248,250,252,0.14)]"
              style={{
                top: targetBox.top - 4,
                left: targetBox.left - 4,
                width: targetBox.width + 8,
                height: targetBox.height + 8,
              }}
            />
          ) : null}

          <div
            className="pointer-events-auto absolute max-h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-border/80 bg-card/98 p-4 text-card-foreground shadow-[0_24px_70px_-28px_rgba(15,23,42,0.28)] dark:bg-card/95 dark:shadow-[0_24px_70px_-28px_rgba(2,6,23,0.62)] backdrop-blur-xl"
            style={tooltipStyle}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Tour guiado {stepIndex + 1}/{steps.length}
            </p>
            <h3 className="mt-1 text-base font-semibold text-foreground">{step.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{step.content}</p>
            {isTargetMissing ? (
              <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200">
                Nao encontramos este elemento agora. Voce pode avancar e continuar o tour normalmente.
              </p>
            ) : null}
            <div className="mt-4 flex items-center justify-between">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>Encerrar</Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onPrev} disabled={stepIndex === 0}>Voltar</Button>
                <Button type="button" size="sm" onClick={onNext}>
                  {stepIndex + 1 < steps.length ? 'Proximo passo' : 'Concluir'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
