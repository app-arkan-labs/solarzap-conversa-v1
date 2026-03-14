import type { GuidedTourStep } from '@/components/onboarding/tourSteps';

export const DEFAULT_GUIDED_TOUR_STEP_DELAY_MS = 300;

const sanitizeSelector = (value?: string): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const querySelectorSafe = (root: ParentNode, selector: string): Element | null => {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
};

export const resolveGuidedTourTargetElement = (
  step: GuidedTourStep | null | undefined,
  root: ParentNode = document,
): Element | null => {
  if (!step) return null;

  const stepWithCompat = step as GuidedTourStep & {
    selector?: string;
    target?: string;
    fallbackSelector?: string;
  };

  const primarySelector = sanitizeSelector(stepWithCompat.target || stepWithCompat.selector);
  if (primarySelector) {
    const primaryTarget = querySelectorSafe(root, primarySelector);
    if (primaryTarget) return primaryTarget;
  }

  const fallbackSelector = sanitizeSelector(stepWithCompat.fallbackSelector);
  if (fallbackSelector) {
    return querySelectorSafe(root, fallbackSelector);
  }

  return null;
};

export const getGuidedTourStepDelayMs = (step: GuidedTourStep | null | undefined): number => {
  const rawDelay = Number(step?.waitForMs);
  if (!Number.isFinite(rawDelay)) return DEFAULT_GUIDED_TOUR_STEP_DELAY_MS;

  const normalized = Math.round(rawDelay);
  if (normalized < 0) return DEFAULT_GUIDED_TOUR_STEP_DELAY_MS;
  if (normalized > 5_000) return 5_000;
  return normalized;
};
