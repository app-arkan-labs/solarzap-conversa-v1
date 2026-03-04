import { describe, expect, it } from 'vitest'

import { digestEmail } from '../../supabase/functions/_shared/emailTemplates.ts'

describe('digestEmail template', () => {
  it('renderiza contrato novo de seções no html e texto', () => {
    const rendered = digestEmail({
      digestType: 'daily',
      dateBucket: '2026-03-01',
      leads: [
        {
          leadName: 'Lead Teste',
          leadPhone: '5511999999999',
          stage: 'proposta_negociacao',
          summary: 'Lead quer fechar ainda esta semana.',
          currentSituation: 'Aguardando retorno sobre condicao final.',
          recommendedActions: 'Enviar proposta revisada e confirmar chamada hoje.',
        },
      ],
      senderName: 'SolarZap',
    })

    expect(rendered.subject).toContain('Resumo das últimas 24h')
    expect(rendered.html).toContain('Resumo das últimas 24h')
    expect(rendered.html).toContain('Resumo:')
    expect(rendered.html).toContain('Situação atual:')
    expect(rendered.html).toContain('Ações recomendadas:')

    expect(rendered.text).toContain('- Resumo: Lead quer fechar ainda esta semana.')
    expect(rendered.text).toContain('- Situação atual: Aguardando retorno sobre condicao final.')
    expect(rendered.text).toContain('- Ações recomendadas: Enviar proposta revisada e confirmar chamada hoje.')

    expect(rendered.html).not.toContain('O que aconteceu:')
    expect(rendered.html).not.toContain('Pendência:')
    expect(rendered.html).not.toContain('Próximo passo:')
  })
})
