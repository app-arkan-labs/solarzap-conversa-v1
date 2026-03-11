export type DigestPromptCommentRow = {
  texto: string | null
  autor: string | null
  comment_type: string | null
  created_at: string
}

function normalizeCompactText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clampText(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value
  return `${value.slice(0, Math.max(0, maxLen - 3)).trim()}...`
}

export function isAiDigestComment(row: Pick<DigestPromptCommentRow, 'autor' | 'comment_type'>): boolean {
  const author = String(row.autor || '').trim().toLowerCase()
  const commentType = String(row.comment_type || '').trim().toLowerCase()
  return commentType === 'ai_daily_summary' || author === 'resumo da ia'
}

export function selectDigestCommentsForPrompt(opts: {
  comments: DigestPromptCommentRow[]
  maxComments: number
}): DigestPromptCommentRow[] {
  const maxComments = Math.max(0, Math.floor(opts.maxComments))
  if (maxComments <= 0 || opts.comments.length === 0) return []

  const filtered = opts.comments
    .filter((row) => !isAiDigestComment(row))
    .filter((row) => normalizeCompactText(row.texto).length > 0)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return filtered.slice(-maxComments)
}

export function renderDigestCommentsForPrompt(
  comments: DigestPromptCommentRow[],
  maxCharsPerComment: number,
): string[] {
  const safeMaxChars = Math.max(32, Math.floor(maxCharsPerComment))
  return comments.map((row) => {
    const author = normalizeCompactText(row.autor) || 'Comentario interno'
    const text = clampText(normalizeCompactText(row.texto), safeMaxChars) || '[sem texto]'
    return `${author}: ${text}`
  })
}

export function mergeDigestLeadIds(
  messageLeadIds: number[],
  commentLeadIds: number[],
): number[] {
  const unique = new Set<number>()
  for (const leadId of [...messageLeadIds, ...commentLeadIds]) {
    if (!Number.isFinite(leadId)) continue
    unique.add(Number(leadId))
  }
  return Array.from(unique)
}
