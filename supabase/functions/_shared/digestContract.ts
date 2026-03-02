export type DigestSections = {
  summary: string
  currentSituation: string
  recommendedActions: string
}

export const DIGEST_LABEL_SUMMARY = 'Resumo'
export const DIGEST_LABEL_CURRENT_SITUATION = 'Situação atual'
export const DIGEST_LABEL_RECOMMENDED_ACTIONS = 'Ações recomendadas'

const DEFAULT_SECTIONS: DigestSections = {
  summary: 'Sem conteúdo textual recente para resumir.',
  currentSituation: 'Sem sinais claros de avanço ou bloqueio no período.',
  recommendedActions: 'Revisar o histórico recente e definir próximo contato com objetivo comercial claro.',
}

function compactText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clampText(value: string, maxLen = 320): string {
  if (value.length <= maxLen) return value
  return `${value.slice(0, Math.max(0, maxLen - 3)).trim()}...`
}

function safeText(value: unknown, fallback: string): string {
  const text = compactText(value)
  if (!text) return fallback
  return clampText(text)
}

export function normalizeDigestSections(
  value: Partial<DigestSections> | null | undefined,
  fallback?: Partial<DigestSections>,
): DigestSections {
  return {
    summary: safeText(
      value?.summary,
      safeText(fallback?.summary, DEFAULT_SECTIONS.summary),
    ),
    currentSituation: safeText(
      value?.currentSituation,
      safeText(fallback?.currentSituation, DEFAULT_SECTIONS.currentSituation),
    ),
    recommendedActions: safeText(
      value?.recommendedActions,
      safeText(fallback?.recommendedActions, DEFAULT_SECTIONS.recommendedActions),
    ),
  }
}

export function renderDigestSectionsTextLines(
  sections: DigestSections,
  opts?: { bulletPrefix?: string },
): string[] {
  const bulletPrefix = opts?.bulletPrefix ?? '- '
  const normalizedPrefix = bulletPrefix ? bulletPrefix : ''
  return [
    `${normalizedPrefix}${DIGEST_LABEL_SUMMARY}: ${sections.summary}`,
    `${normalizedPrefix}${DIGEST_LABEL_CURRENT_SITUATION}: ${sections.currentSituation}`,
    `${normalizedPrefix}${DIGEST_LABEL_RECOMMENDED_ACTIONS}: ${sections.recommendedActions}`,
  ]
}

type DigestMessageRow = {
  mensagem: string | null
  wa_from_me: boolean | null
  created_at: string
}

export function buildFallbackDigestSections(
  messages: DigestMessageRow[],
  opts?: { stage?: string },
): DigestSections {
  const sorted = [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const last = sorted[sorted.length - 1]
  const first = sorted[0]
  const stage = compactText(opts?.stage || 'sem_etapa')
  const lastText = safeText(last?.mensagem, 'Sem conteúdo textual recente.')
  const firstText = safeText(first?.mensagem, '')
  const lastFromClient = last ? last.wa_from_me !== true : false

  const summary = firstText && firstText !== lastText
    ? `Interpretação do período: iniciou com "${firstText}" e evoluiu para "${lastText}".`
    : `Interpretação do período: ${lastText}`

  const currentSituation = lastFromClient
    ? `Lead aguardando retorno comercial na etapa "${stage}".`
    : `Contato já respondido pelo time na etapa "${stage}", sem nova pendência explícita.`

  const recommendedActions = lastFromClient
    ? `Responder com proposta objetiva, validar dúvidas pendentes e confirmar próximo compromisso.`
    : `Executar follow-up de confirmação e registrar próximo marco comercial da etapa.`

  return normalizeDigestSections({
    summary,
    currentSituation,
    recommendedActions,
  })
}
