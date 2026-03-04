import type { DigestType } from './digestContract.ts'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS

export function resolveDigestPeriodBounds(digestType: DigestType, nowDate = new Date()) {
  const now = new Date(nowDate)
  const periodEndIso = now.toISOString()
  const periodMs = digestType === 'weekly' ? SEVEN_DAYS_MS : ONE_DAY_MS

  return {
    periodStartIso: new Date(now.getTime() - periodMs).toISOString(),
    periodEndIso,
  }
}
