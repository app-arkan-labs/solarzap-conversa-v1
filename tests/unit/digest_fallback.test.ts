import { describe, expect, it } from 'vitest';

import {
  buildFallbackDigestSections,
  renderDigestSectionsTextLines,
} from '../../supabase/functions/_shared/digestContract.ts';

describe('digest fallback', () => {
  it('gera secoes validas quando IA nao estiver disponivel', () => {
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
    );

    const lines = renderDigestSectionsTextLines(sections);

    expect(sections.summary.length).toBeGreaterThan(0);
    expect(sections.currentSituation.length).toBeGreaterThan(0);
    expect(sections.recommendedActions.length).toBeGreaterThan(0);
    expect(lines.join('\n')).toContain('Resumo:');
    expect(lines.join('\n')).toContain('Situação atual:');
    expect(lines.join('\n')).toContain('Ações recomendadas:');
  });
});
