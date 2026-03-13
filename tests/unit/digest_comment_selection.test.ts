import { describe, expect, it } from 'vitest'

import {
  isAiDigestComment,
  mergeDigestLeadIds,
  renderDigestCommentsForPrompt,
  selectDigestCommentsForPrompt,
  type DigestPromptCommentRow,
} from '../../supabase/functions/_shared/digestCommentSelection.ts'

describe('digest comment selection', () => {
  it('filters old digest comments and keeps recent human/system comments', () => {
    const comments: DigestPromptCommentRow[] = [
      {
        created_at: '2026-03-11T10:00:00.000Z',
        autor: 'Resumo da IA',
        comment_type: 'ai_daily_summary',
        texto: 'Resumo anterior',
      },
      {
        created_at: '2026-03-11T10:05:00.000Z',
        autor: 'Sistema',
        comment_type: null,
        texto: 'Outcome visita: proposta_negociacao',
      },
      {
        created_at: '2026-03-11T10:06:00.000Z',
        autor: 'Angelina - Leao Solar',
        comment_type: null,
        texto: 'lead ficou indeciso com outros orcamentos',
      },
      {
        created_at: '2026-03-11T10:07:00.000Z',
        autor: 'Vendedor',
        comment_type: null,
        texto: '   ',
      },
    ]

    const selected = selectDigestCommentsForPrompt({
      comments,
      maxComments: 6,
    })

    expect(selected).toHaveLength(2)
    expect(selected.every((row) => !isAiDigestComment(row))).toBe(true)
    expect(selected.map((row) => row.autor)).toEqual(['Sistema', 'Angelina - Leao Solar'])
  })

  it('includes leads with comment-only activity in the merged lead list', () => {
    const merged = mergeDigestLeadIds([100, 101], [101, 1301])
    expect(merged).toEqual([100, 101, 1301])
  })

  it('renders compact prompt lines with author fallback and clamp', () => {
    const lines = renderDigestCommentsForPrompt(
      [
        {
          created_at: '2026-03-11T10:08:00.000Z',
          autor: null,
          comment_type: null,
          texto: 'comentario com texto suficientemente longo para testar truncamento explicito no prompt',
        },
      ],
      48,
    )

    expect(lines).toHaveLength(1)
    expect(lines[0].startsWith('Comentario interno: ')).toBe(true)
    expect(lines[0].length).toBeLessThanOrEqual(80)
  })
})
