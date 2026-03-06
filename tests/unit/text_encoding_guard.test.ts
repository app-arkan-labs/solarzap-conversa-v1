import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..', '..')

const SCAN_TARGETS = [
  'supabase/functions/_shared/emailTemplates.ts',
  'src/components/solarzap/IntegrationsView.tsx',
  'src/components/solarzap/WhatsAppInstancesManager.tsx',
  // Explicit allowlist entries (intentionally contain mojibake patterns for repair logic).
  'supabase/functions/ai-pipeline-agent/index.ts',
  'src/utils/pdf/legacyRenderer.ts',
]

const ALLOWLIST = new Set([
  'supabase/functions/ai-pipeline-agent/index.ts',
  'src/utils/pdf/legacyRenderer.ts',
])

const MOJIBAKE_REGEX = /(?:\u00C3[\u00A0-\u00FF]|\u00C2[\u00A0-\u00FF]|\u00F0\u0178|\u00E2\u20AC|\uFFFD)/u

function findSuspiciousLines(content: string): Array<{ line: number; token: string }> {
  const lines = content.split(/\r?\n/)
  const matches: Array<{ line: number; token: string }> = []

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    const line = lines[lineIdx]
    const lineMatch = line.match(MOJIBAKE_REGEX)
    if (lineMatch) {
      matches.push({ line: lineIdx + 1, token: lineMatch[0] })
    }
  }

  return matches
}

describe('text encoding guard rails', () => {
  it('blocks mojibake patterns on user-facing templates and UI strings', () => {
    const findings: Array<{ file: string; line: number; token: string }> = []

    for (const relativePath of SCAN_TARGETS) {
      if (ALLOWLIST.has(relativePath)) continue

      const absPath = path.resolve(ROOT, relativePath)
      const content = fs.readFileSync(absPath, 'utf8')
      const lineMatches = findSuspiciousLines(content)
      for (const match of lineMatches) {
        findings.push({ file: relativePath, line: match.line, token: match.token })
      }
    }

    expect(findings).toEqual([])
  })
})
