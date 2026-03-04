import {
  getDigestTitle,
  renderDigestSectionsTextLines,
  type DigestSections,
  type DigestType,
} from './digestContract.ts'

type DigestTextLeadSummary = {
  leadName: string
  stage: string
  sections: DigestSections
}

function formatPeriodBoundary(iso: string, timezone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false,
  }).format(date)
}

function formatPeriodLine(startIso: string, endIso: string, timezone: string): string {
  return `Período: ${formatPeriodBoundary(startIso, timezone)} até ${formatPeriodBoundary(endIso, timezone)} (${timezone})`
}

export function buildDigestTextMessage(opts: {
  digestType: DigestType
  dateBucket: string
  timezone: string
  periodStartIso: string
  periodEndIso: string
  leads: DigestTextLeadSummary[]
}): string {
  const headerLines = [
    `${getDigestTitle(opts.digestType)} (${opts.dateBucket})`,
    formatPeriodLine(opts.periodStartIso, opts.periodEndIso, opts.timezone),
    `Leads com atividade: ${opts.leads.length}`,
  ]

  if (opts.leads.length === 0) {
    return headerLines.join('\n')
  }

  const leadBlocks = opts.leads.map((lead, idx) => ([
    '────────────────────',
    `${idx + 1}. ${lead.leadName} [${lead.stage}]`,
    ...renderDigestSectionsTextLines(lead.sections),
  ].join('\n')))

  return [...headerLines, '', ...leadBlocks].join('\n')
}
