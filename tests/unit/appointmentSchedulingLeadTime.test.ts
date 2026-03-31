import { describe, expect, it } from 'vitest';

import {
  resolveMinimumLeadSlotStart,
  type AppointmentWindowRule,
  zonedDateTimeToUtc,
} from '../../supabase/functions/_shared/appointmentScheduling';

const TIME_ZONE = 'America/Sao_Paulo';
const WINDOW_RULES: AppointmentWindowRule[] = [
  { start: '09:00', end: '12:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  { start: '14:00', end: '18:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
];

function atSaoPaulo(year: number, month: number, day: number, hour: number, minute = 0) {
  return zonedDateTimeToUtc(year, month, day, hour, minute, 0, TIME_ZONE);
}

describe('resolveMinimumLeadSlotStart', () => {
  it('returns 11h when the request happens at 7h', () => {
    const slot = resolveMinimumLeadSlotStart({
      now: atSaoPaulo(2026, 3, 30, 7),
      timeZone: TIME_ZONE,
      windowRules: WINDOW_RULES,
      minLeadHours: 3,
      slotMinutes: 60,
      lookaheadDays: 7,
    });

    expect(slot).toBe(atSaoPaulo(2026, 3, 30, 11).toISOString());
  });

  it('returns 16h when the request happens at 11h', () => {
    const slot = resolveMinimumLeadSlotStart({
      now: atSaoPaulo(2026, 3, 30, 11),
      timeZone: TIME_ZONE,
      windowRules: WINDOW_RULES,
      minLeadHours: 3,
      slotMinutes: 60,
      lookaheadDays: 7,
    });

    expect(slot).toBe(atSaoPaulo(2026, 3, 30, 16).toISOString());
  });

  it('rolls over to the next business day when needed', () => {
    const slot = resolveMinimumLeadSlotStart({
      now: atSaoPaulo(2026, 3, 30, 15),
      timeZone: TIME_ZONE,
      windowRules: WINDOW_RULES,
      minLeadHours: 3,
      slotMinutes: 60,
      lookaheadDays: 7,
    });

    expect(slot).toBe(atSaoPaulo(2026, 3, 31, 9).toISOString());
  });
});