import { describe, expect, it } from 'vitest';

import { partitionDayEvents } from '@/lib/calendarDayEvents';

describe('partitionDayEvents', () => {
  it('keeps first four events visible and counts overflow', () => {
    const events = [1, 2, 3, 4, 5, 6];
    const result = partitionDayEvents(events, 4);

    expect(result.visible).toEqual([1, 2, 3, 4]);
    expect(result.hiddenCount).toBe(2);
  });

  it('shows all events when below limit', () => {
    const events = [1, 2];
    const result = partitionDayEvents(events, 4);

    expect(result.visible).toEqual([1, 2]);
    expect(result.hiddenCount).toBe(0);
  });

  it('normalizes invalid maxVisible values', () => {
    expect(partitionDayEvents([1, 2, 3], -1)).toEqual({
      visible: [],
      hiddenCount: 3,
    });

    expect(partitionDayEvents([1, 2, 3], 2.8)).toEqual({
      visible: [1, 2],
      hiddenCount: 1,
    });
  });
});
