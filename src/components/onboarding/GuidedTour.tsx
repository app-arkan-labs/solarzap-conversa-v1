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

  useEffect(() => {
    if (!running || !step) return;

    const update = () => {
      const element = resolveGuidedTourTargetElement(step);
      if (!element) {
        setTargetBox(null);
        return;
      }

      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

      const rect = element.getBoundingClientRect();
      setTargetBox({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    const timeoutId = setTimeout(update, getGuidedTourStepDelayMs(step));
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [running, step]);

  const tooltipStyle = useMemo(() => {
    const maxWidth = 340;
    if (!targetBox) {
      return {
        top: 24,
        left: clamp(window.innerWidth / 2 - maxWidth / 2, 12, window.innerWidth - maxWidth - 12),
      };
    }

    const preferredTop = targetBox.top + targetBox.height + 12;
    const fallbackTop = Math.max(12, targetBox.top - 220);
    const top = preferredTop + 220 < window.innerHeight ? preferredTop : fallbackTop;
    const left = clamp(targetBox.left, 12, window.innerWidth - maxWidth - 12);
    return { top, left };
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
          <div className="absolute inset-0 bg-black/45" />

          {targetBox ? (
            <div
              className="absolute rounded-xl border-2 border-primary shadow-[0_0_0_9999px_rgba(2,6,23,0.52)]"
              style={{
                top: targetBox.top - 4,
                left: targetBox.left - 4,
                width: targetBox.width + 8,
                height: targetBox.height + 8,
              }}
            />
          ) : null}

          <div
            className="pointer-events-auto absolute w-[340px] rounded-2xl border border-border/80 bg-card/96 p-4 text-card-foreground shadow-[0_24px_70px_-28px_rgba(15,23,42,0.28)] dark:shadow-[0_24px_70px_-28px_rgba(2,6,23,0.62)] backdrop-blur-xl"
            style={tooltipStyle}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Tour guiado {stepIndex + 1}/{steps.length}
            </p>
            <h3 className="mt-1 text-base font-semibold text-foreground">{step.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
            <div className="mt-4 flex items-center justify-between">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>Encerrar</Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onPrev} disabled={stepIndex === 0}>Voltar</Button>
                <Button type="button" size="sm" onClick={onNext}>
                  {stepIndex + 1 < steps.length ? 'Proximo' : 'Concluir'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
