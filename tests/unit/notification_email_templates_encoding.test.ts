import { describe, expect, it } from 'vitest'

import {
  chamadaAgendadaEmail,
  chamadaRealizadaEmail,
  defaultEventEmail,
  financiamentoUpdateEmail,
  installmentDueCheckEmail,
  novoLeadEmail,
  stageChangedEmail,
  visitaAgendadaEmail,
  visitaRealizadaEmail,
} from '../../supabase/functions/_shared/emailTemplates.ts'

const MOJIBAKE_REGEX = /(?:\u00C3[\u00A0-\u00FF]|\u00C2[\u00A0-\u00FF]|\u00F0\u0178|\u00E2\u20AC|\uFFFD)/u

function expectNoMojibake(payload: string) {
  expect(MOJIBAKE_REGEX.test(payload)).toBe(false)
}

describe('notification email templates encoding', () => {
  it('renders all notification templates without mojibake and with expected accents/emojis', () => {
    const baseCtx = {
      senderName: 'ARKAN SOLAR',
      leadName: 'Diego',
      leadPhone: '5511999999999',
      title: 'Visita t\u00E9cnica residencial',
      startAt: '2026-03-06T15:30:00.000Z',
      fromStage: 'novo_lead',
      toStage: 'proposta_pronta',
      dueOn: '2026-03-07T12:00:00.000Z',
      amount: 'R$ 599,90',
      installmentNo: 3,
    }

    const rendered = [
      novoLeadEmail(baseCtx),
      visitaAgendadaEmail(baseCtx),
      visitaRealizadaEmail(baseCtx),
      chamadaAgendadaEmail(baseCtx),
      chamadaRealizadaEmail(baseCtx),
      stageChangedEmail(baseCtx),
      financiamentoUpdateEmail(baseCtx),
      installmentDueCheckEmail(baseCtx),
      defaultEventEmail({ ...baseCtx, eventType: 'evento_custom' }),
    ]

    for (const item of rendered) {
      expectNoMojibake(item.subject)
      expectNoMojibake(item.html)
      expectNoMojibake(item.text)
    }

    expect(rendered[0].subject).toContain('\u{1F7E2}')
    expect(rendered[1].html).toContain('visita t\u00E9cnica')
    expect(rendered[5].subject).toContain('\u2192')
    expect(rendered[6].html).toContain('Atualiza\u00E7\u00E3o de Financiamento')
    expect(rendered[8].subject).toContain('\u{1F514}')
  })
})
