import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FollowUpIndicator } from '@/components/solarzap/FollowUpIndicator';

describe('FollowUpIndicator', () => {
  it('renders five dots', () => {
    const { container } = render(React.createElement(FollowUpIndicator, { step: 2, enabled: true }));
    expect(container.querySelectorAll('span')).toHaveLength(5);
  });

  it('fills dots according to current step when enabled', () => {
    const { container } = render(React.createElement(FollowUpIndicator, { step: 3, enabled: true }));
    const dots = Array.from(container.querySelectorAll('span'));
    const filled = dots.filter((dot) => dot.className.includes('bg-emerald-500'));
    const pending = dots.filter((dot) => dot.className.includes('bg-muted'));

    expect(filled).toHaveLength(3);
    expect(pending).toHaveLength(2);
  });

  it('marks all dots as exhausted on step 5', () => {
    const { container } = render(React.createElement(FollowUpIndicator, { step: 5, enabled: true }));
    const dots = Array.from(container.querySelectorAll('span'));
    const exhausted = dots.filter((dot) => dot.className.includes('bg-red-500'));

    expect(exhausted).toHaveLength(5);
  });

  it('keeps dots inactive when follow-up is disabled', () => {
    const { container } = render(React.createElement(FollowUpIndicator, { step: 4, enabled: false }));
    const root = container.firstElementChild as HTMLElement | null;
    const dots = Array.from(container.querySelectorAll('span'));
    const pending = dots.filter((dot) => dot.className.includes('bg-muted'));

    expect(root?.getAttribute('title')).toBe('Follow-up desabilitado');
    expect(pending).toHaveLength(5);
  });
});
