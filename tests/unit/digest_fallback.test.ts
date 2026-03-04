import { describe, expect, it } from 'vitest'

import {
  DIGEST_LABEL_CURRENT_SITUATION,
  DIGEST_LABEL_RECOMMENDED_ACTIONS,
  buildFallbackDigestSections,
  renderDigestSectionsTextLines,
} from '../../supabase/functions/_shared/digestContract.ts'

describe('digest fallback', () => {
  it('gera seções válidas quando IA não estiver disponível', () => {
    const sections = buildFallbackDigestSections(
      [
        {
          created_at: '2026-03-01T10:00:00.000Z',
          mensagem: 'Bom dia, tenho interesse no projeto',
          wa_from_me: false,
        },
        {
          created_at: '2026-03-01T10:05:00.000Z',
          mensagem: 'Perfeito, vou preparar a simulacao para voce.',
          wa_from_me: true,
        },
        {
          created_at: '2026-03-01T10:07:00.000Z',
          mensagem: 'Consegue reduzir a parcela?',
          wa_from_me: false,
        },
      ],
      { stage: 'proposta_negociacao' },
    )

    const lines = renderDigestSectionsTextLines(sections)
    const full = lines.join('\n')

    expect(sections.summary.length).toBeGreaterThan(0)
    expect(sections.currentSituation.length).toBeGreaterThan(0)
    expect(sections.recommendedActions.length).toBeGreaterThan(0)
    expect(full).toContain('Resumo:')
    expect(full).toContain(`${DIGEST_LABEL_CURRENT_SITUATION}:`)
    expect(full).toContain(`${DIGEST_LABEL_RECOMMENDED_ACTIONS}:`)
  })
})
