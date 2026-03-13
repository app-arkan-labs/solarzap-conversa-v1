import { describe, expect, it } from 'vitest'

import { selectDigestMessagesForPrompt, type DigestPromptMessageRow } from '../../supabase/functions/_shared/digestMessageSelection.ts'

const DAY_MS = 24 * 60 * 60 * 1000

function isoOffset(startIso: string, dayOffset: number, hour: number, minute = 0): string {
  const base = new Date(startIso).getTime() + (dayOffset * DAY_MS)
  const date = new Date(base)
  date.setUTCHours(hour, minute, 0, 0)
  return date.toISOString()
}

describe('weekly digest message selection', () => {
  it('covers all 7 daily buckets without exceeding prompt budget and keeps recency tail', () => {
    const periodStartIso = '2026-03-01T00:00:00.000Z'
    const periodEndIso = '2026-03-08T00:00:00.000Z'

    const messages: DigestPromptMessageRow[] = []
    for (let day = 0; day < 7; day += 1) {
      messages.push({
        created_at: isoOffset(periodStartIso, day, 9, 0),
        mensagem: `vendedor abertura d${day}`,
        wa_from_me: true,
      })
      messages.push({
        created_at: isoOffset(periodStartIso, day, 11, 30),
        mensagem: `lead resposta d${day}`,
        wa_from_me: day === 3 ? true : false,
      })
      messages.push({
        created_at: isoOffset(periodStartIso, day, 16, 15),
        mensagem: `vendedor proposta d${day}`,
        wa_from_me: true,
      })
      messages.push({
        created_at: isoOffset(periodStartIso, day, 22, 45),
        mensagem: `follow-up final d${day}`,
        wa_from_me: day === 3 ? true : false,
      })
    }

    // Extra recency pressure near the end of window.
    messages.push({
      created_at: isoOffset(periodStartIso, 6, 23, 35),
      mensagem: 'lead fechamento final',
      wa_from_me: false,
    })
    messages.push({
      created_at: isoOffset(periodStartIso, 6, 23, 50),
      mensagem: 'vendedor confirmacao final',
      wa_from_me: true,
    })

    const selected = selectDigestMessagesForPrompt({
      digestType: 'weekly',
      messages,
      maxMessages: 12,
      periodStartIso,
      periodEndIso,
    })

    expect(selected.length).toBeLessThanOrEqual(12)
    expect(selected.length).toBeGreaterThanOrEqual(7)

    for (let i = 1; i < selected.length; i += 1) {
      expect(new Date(selected[i - 1].created_at).getTime()).toBeLessThanOrEqual(new Date(selected[i].created_at).getTime())
    }

    const bucketCoverage = new Set(
      selected.map((item) => Math.floor((new Date(item.created_at).getTime() - new Date(periodStartIso).getTime()) / DAY_MS)),
    )
    expect(bucketCoverage.size).toBe(7)
    for (let day = 0; day < 7; day += 1) {
      expect(bucketCoverage.has(day)).toBe(true)
    }

    expect(selected.some((row) => row.mensagem === 'vendedor confirmacao final')).toBe(true)
  })

  it('keeps daily behavior equal to last 12 chronologically sorted messages', () => {
    const messages: DigestPromptMessageRow[] = Array.from({ length: 20 }).map((_, index) => ({
      created_at: new Date(Date.parse('2026-03-07T00:00:00.000Z') + (index * 60_000)).toISOString(),
      mensagem: `msg-${index}`,
      wa_from_me: index % 2 === 0,
    }))

    const shuffled = [...messages].reverse()
    const expected = [...shuffled]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(-12)
      .map((row) => row.mensagem)

    const selected = selectDigestMessagesForPrompt({
      digestType: 'daily',
      messages: shuffled,
      maxMessages: 12,
    }).map((row) => row.mensagem)

    expect(selected).toEqual(expected)
  })
})
