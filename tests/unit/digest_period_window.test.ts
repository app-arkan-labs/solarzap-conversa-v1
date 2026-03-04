import { describe, expect, it } from 'vitest'

import { resolveDigestPeriodBounds } from '../../supabase/functions/_shared/digestPeriod.ts'

describe('digest period window', () => {
  it('usa janela diária rolante de 24h', () => {
    const now = new Date('2026-03-04T09:30:00.000Z')
    const period = resolveDigestPeriodBounds('daily', now)

    expect(period.periodEndIso).toBe('2026-03-04T09:30:00.000Z')
    expect(period.periodStartIso).toBe('2026-03-03T09:30:00.000Z')
    expect(new Date(period.periodEndIso).getTime() - new Date(period.periodStartIso).getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it('usa janela semanal rolante de 7 dias', () => {
    const now = new Date('2026-03-04T09:30:00.000Z')
    const period = resolveDigestPeriodBounds('weekly', now)

    expect(period.periodEndIso).toBe('2026-03-04T09:30:00.000Z')
    expect(period.periodStartIso).toBe('2026-02-25T09:30:00.000Z')
    expect(new Date(period.periodEndIso).getTime() - new Date(period.periodStartIso).getTime()).toBe(7 * 24 * 60 * 60 * 1000)
  })
})
