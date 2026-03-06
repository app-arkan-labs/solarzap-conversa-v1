import type { DigestType } from './digestContract.ts'

export type DigestPromptMessageRow = {
  mensagem: string | null
  wa_from_me: boolean | null
  created_at: string
}

type SelectDigestMessagesForPromptOptions = {
  digestType: DigestType
  messages: DigestPromptMessageRow[]
  maxMessages: number
  periodStartIso?: string
  periodEndIso?: string
}

function sortMessagesChronologically(messages: DigestPromptMessageRow[]): DigestPromptMessageRow[] {
  return [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

function parseIsoTimestamp(value: string | undefined): number | null {
  if (!value) return null
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function selectWeeklyAnchors(
  sorted: DigestPromptMessageRow[],
  periodStartIso: string | undefined,
  periodEndIso: string | undefined,
): Set<number> {
  const periodStartMs = parseIsoTimestamp(periodStartIso)
  const periodEndMs = parseIsoTimestamp(periodEndIso)
  if (periodStartMs == null || periodEndMs == null || periodEndMs <= periodStartMs) {
    return new Set<number>()
  }

  const bucketCount = 7
  const bucketSizeMs = (periodEndMs - periodStartMs) / bucketCount
  if (!Number.isFinite(bucketSizeMs) || bucketSizeMs <= 0) {
    return new Set<number>()
  }

  const buckets = Array.from({ length: bucketCount }, () => [] as number[])
  for (let i = 0; i < sorted.length; i += 1) {
    const ts = parseIsoTimestamp(sorted[i].created_at)
    if (ts == null) continue
    if (ts < periodStartMs || ts > periodEndMs) continue
    const bucketIdxRaw = Math.floor((ts - periodStartMs) / bucketSizeMs)
    const bucketIdx = clamp(bucketIdxRaw, 0, bucketCount - 1)
    buckets[bucketIdx].push(i)
  }

  const selected = new Set<number>()
  for (const bucketIndexes of buckets) {
    if (bucketIndexes.length === 0) continue

    let chosen = -1
    for (let idx = bucketIndexes.length - 1; idx >= 0; idx -= 1) {
      const messageIdx = bucketIndexes[idx]
      if (sorted[messageIdx].wa_from_me !== true) {
        chosen = messageIdx
        break
      }
    }

    if (chosen < 0) {
      chosen = bucketIndexes[bucketIndexes.length - 1]
    }

    selected.add(chosen)
  }

  return selected
}

export function selectDigestMessagesForPrompt(
  opts: SelectDigestMessagesForPromptOptions,
): DigestPromptMessageRow[] {
  const maxMessages = Math.max(0, Math.floor(opts.maxMessages))
  if (maxMessages <= 0 || opts.messages.length === 0) return []

  const sorted = sortMessagesChronologically(opts.messages)
  if (opts.digestType !== 'weekly') {
    return sorted.slice(-maxMessages)
  }

  const selectedIndexes = selectWeeklyAnchors(sorted, opts.periodStartIso, opts.periodEndIso)
  if (selectedIndexes.size === 0) {
    return sorted.slice(-maxMessages)
  }

  // Fill remaining prompt budget with most recent messages not already selected.
  for (let idx = sorted.length - 1; idx >= 0 && selectedIndexes.size < maxMessages; idx -= 1) {
    if (!selectedIndexes.has(idx)) {
      selectedIndexes.add(idx)
    }
  }

  const ordered = Array.from(selectedIndexes).sort((a, b) => a - b)
  const trimmed = ordered.length > maxMessages ? ordered.slice(ordered.length - maxMessages) : ordered
  return trimmed.map((idx) => sorted[idx])
}
