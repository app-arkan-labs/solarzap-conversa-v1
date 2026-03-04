import { describe, expect, it } from 'vitest'

import { normalizeDigestSections } from '../../supabase/functions/_shared/digestContract.ts'
import { buildDigestTextMessage } from '../../supabase/functions/_shared/digestTextFormatter.ts'

describe('digest whatsapp formatting', () => {
  it('monta mensagem em blocos por lead com labels canônicos', () => {
    const text = buildDigestTextMessage({
      digestType: 'daily',
      dateBucket: '2026-03-04',
      timezone: 'America/Sao_Paulo',
      periodStartIso: '2026-03-03T09:30:00.000Z',
      periodEndIso: '2026-03-04T09:30:00.000Z',
      leads: [
        {
          leadName: 'Isabeli Soares',
          stage: 'proposta_pronta',
          sections: normalizeDigestSections({
            summary: 'Conversa evoluiu para confirmação de proposta.',
            currentSituation: 'Lead aguarda retorno com condição final.',
            recommendedActions: 'Enviar proposta revisada e confirmar reunião.',
          }),
        },
        {
          leadName: 'Lucas Dantas',
          stage: 'respondeu',
          sections: normalizeDigestSections({
            summary: 'Lead respondeu com interesse em nova simulação.',
            currentSituation: 'Fluxo ativo sem bloqueio explícito.',
            recommendedActions: 'Manter follow-up com CTA de fechamento.',
          }),
        },
      ],
    })

    expect(text).toContain('Resumo das últimas 24h (2026-03-04)')
    expect(text).toContain('Período:')
    expect(text).toContain('Leads com atividade: 2')
    expect(text).toContain('────────────────────')
    expect(text).toContain('1. Isabeli Soares [proposta_pronta]')
    expect(text).toContain('2. Lucas Dantas [respondeu]')
    expect(text).toContain('- Resumo:')
    expect(text).toContain('- Situação atual:')
    expect(text).toContain('- Ações recomendadas:')
    expect(text).not.toContain('O que aconteceu:')
    expect(text).not.toContain('Pendência:')
    expect(text).not.toContain('Próximo passo:')
  })
})
