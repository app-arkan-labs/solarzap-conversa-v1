import { describe, expect, it } from 'vitest';

import {
  DIGEST_LABEL_CURRENT_SITUATION,
  DIGEST_LABEL_RECOMMENDED_ACTIONS,
  DIGEST_LABEL_SUMMARY,
  normalizeDigestSections,
  renderDigestSectionsTextLines,
} from '../../supabase/functions/_shared/digestContract.ts';

describe('digestContract', () => {
  it('normaliza secoes e gera labels canonicas', () => {
    const sections = normalizeDigestSections({
      summary: '  Cliente pediu nova simulacao de prazo.  ',
      currentSituation: '',
      recommendedActions: ' ',
    });

    const lines = renderDigestSectionsTextLines(sections);
    const full = lines.join('\n');

    expect(lines).toHaveLength(3);
    expect(full).toContain(`${DIGEST_LABEL_SUMMARY}:`);
    expect(full).toContain(`${DIGEST_LABEL_CURRENT_SITUATION}:`);
    expect(full).toContain(`${DIGEST_LABEL_RECOMMENDED_ACTIONS}:`);
    expect(full).not.toContain('O que aconteceu');
    expect(full).not.toContain('Pendência');
    expect(full).not.toContain('Próximo passo');
  });
});
