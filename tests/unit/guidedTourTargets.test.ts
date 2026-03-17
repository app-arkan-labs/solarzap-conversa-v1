import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GUIDED_TOUR_STEP_DELAY_MS,
  getGuidedTourStepDelayMs,
  resolveGuidedTourTargetElement,
} from '@/lib/guidedTourTargets';
import type { GuidedTourStep } from '@/components/onboarding/tourSteps';

type CompatGuidedTourStep = GuidedTourStep & {
  target?: string;
  fallbackSelector?: string;
  waitForMs?: number;
};

const buildStep = (overrides: Partial<CompatGuidedTourStep> = {}): CompatGuidedTourStep => ({
  id: 'step-1',
  title: 'Step',
  description: 'Content',
  selector: '[data-testid="primary"]',
  target: '[data-testid="primary"]',
  ...overrides,
});

describe('guided tour target resolver', () => {
  it('uses primary selector when available', () => {
    document.body.innerHTML = '<div data-testid="primary"></div><div data-testid="fallback"></div>';
    const step = buildStep({ fallbackSelector: '[data-testid="fallback"]' });

    const target = resolveGuidedTourTargetElement(step);

    expect(target).not.toBeNull();
    expect(target?.getAttribute('data-testid')).toBe('primary');
  });

  it('falls back when primary selector does not exist', () => {
    document.body.innerHTML = '<div data-testid="fallback"></div>';
    const step = buildStep({
      target: '[data-testid="missing"]',
      fallbackSelector: '[data-testid="fallback"]',
    });

    const target = resolveGuidedTourTargetElement(step);

    expect(target).not.toBeNull();
    expect(target?.getAttribute('data-testid')).toBe('fallback');
  });

  it('returns null for invalid selectors without throwing', () => {
    document.body.innerHTML = '<div data-testid="fallback"></div>';
    const step = buildStep({
      target: '[]',
      fallbackSelector: '[data-testid="missing"]',
    });

    const target = resolveGuidedTourTargetElement(step);

    expect(target).toBeNull();
  });
});

describe('guided tour step delay', () => {
  it('uses default delay when waitForMs is not defined', () => {
    expect(getGuidedTourStepDelayMs(buildStep())).toBe(DEFAULT_GUIDED_TOUR_STEP_DELAY_MS);
  });

  it('clamps and normalizes waitForMs values', () => {
    expect(getGuidedTourStepDelayMs(buildStep({ waitForMs: -50 }))).toBe(DEFAULT_GUIDED_TOUR_STEP_DELAY_MS);
    expect(getGuidedTourStepDelayMs(buildStep({ waitForMs: 120.7 }))).toBe(121);
    expect(getGuidedTourStepDelayMs(buildStep({ waitForMs: 9000 }))).toBe(5000);
  });
});
