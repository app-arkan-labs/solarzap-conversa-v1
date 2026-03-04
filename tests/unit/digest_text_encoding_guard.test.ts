import { describe, expect, it } from 'vitest'

import { normalizeDigestSections } from '../../supabase/functions/_shared/digestContract.ts'
import { digestEmail } from '../../supabase/functions/_shared/emailTemplates.ts'
import { buildDigestTextMessage } from '../../supabase/functions/_shared/digestTextFormatter.ts'

describe('digest text encoding guard', () => {
  it('não gera mojibake no e-mail e no texto do digest', () => {
    const email = digestEmail({
      digestType: 'daily',
      dateBucket: '2026-03-04',
      leads: [
        {
          leadName: 'Angelina',
          leadPhone: '5511999999999',
          stage: 'visita_agendada',
          summary: 'Resumo com acentuação válida.',
          currentSituation: 'Situação atual com ç e ã.',
          recommendedActions: 'Ações recomendadas com revisão.',
        },
      ],
      senderName: 'SolarZap',
    })

    const digestText = buildDigestTextMessage({
      digestType: 'daily',
      dateBucket: '2026-03-04',
      timezone: 'America/Sao_Paulo',
      periodStartIso: '2026-03-03T09:30:00.000Z',
      periodEndIso: '2026-03-04T09:30:00.000Z',
      leads: [
        {
          leadName: 'Angelina',
          stage: 'visita_agendada',
          sections: normalizeDigestSections({
            summary: 'Resumo com acentuação válida.',
            currentSituation: 'Situação atual com ç e ã.',
            recommendedActions: 'Ações recomendadas com revisão.',
          }),
        },
      ],
    })

    const payloads = [email.subject, email.html, email.text, digestText]
    for (const payload of payloads) {
      expect(payload).not.toMatch(/Ã|�/)
    }
  })
})
