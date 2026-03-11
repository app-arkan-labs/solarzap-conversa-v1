import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('pipeline agent ops scripts', () => {
  it('reconfigure cron script validates the current worker target', () => {
    const sql = read('scripts/ops/reconfigure_process_agent_jobs_cron.sql')

    expect(sql).toContain('process-agent-jobs-worker')
    expect(sql).toContain('Cron validation failed')
    expect(sql).toContain('/functions/v1/process-agent-jobs')
  })

  it('ships a non-mutating audit query for pipeline agents', () => {
    const sql = read('scripts/ops/audit_pipeline_agents.sql')

    expect(sql).toContain('FROM cron.job')
    expect(sql).toContain('FROM public.ai_stage_config')
    expect(sql).toContain('FROM public.scheduled_agent_jobs')
    expect(sql).toContain('agent_run_outcome')
  })
})
