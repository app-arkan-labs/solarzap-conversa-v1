import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..', '..')
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.env', '.html', '.js', '.json', '.jsx', '.md', '.mjs',
  '.ps1', '.py', '.scss', '.sql', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml',
])

const MOJIBAKE_REGEX = /(?:\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]|\u00E2[\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]|\u00F0\u0178|\u00EF\u00B8|\u00EF\u00BF|\u00C0\u00A0|[\u0080-\u009F\uFFFD])/u

const trackedTextFiles = () => execFileSync('git', ['ls-files', '-z'], { cwd: ROOT })
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .filter((relativePath) => TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase()))

describe('text encoding guard rails', () => {
  it('keeps every tracked text file valid UTF-8 and free of mojibake', () => {
    const findings: string[] = []
    const decoder = new TextDecoder('utf-8', { fatal: true })

    for (const relativePath of trackedTextFiles()) {
      const bytes = fs.readFileSync(path.resolve(ROOT, relativePath))
      let content: string

      try {
        content = decoder.decode(bytes)
      } catch {
        findings.push(`${relativePath}: invalid UTF-8`)
        continue
      }

      content.split(/\r?\n/).forEach((line, index) => {
        const match = line.match(MOJIBAKE_REGEX)
        if (match) findings.push(`${relativePath}:${index + 1}: ${match[0]}`)
      })
    }

    expect(findings).toEqual([])
  })
})
