import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('ai pipeline handoff + instance profile contract', () => {
  it('keeps runtime hooks for per-instance persona, handoff and appointment assignee fallback', () => {
    const agent = read('supabase/functions/ai-pipeline-agent/index.ts');

    expect(agent).toContain('extractLeadHandoffCandidate');
    expect(agent).toContain('executeLeadHandoff');
    expect(agent).toContain('lead_handoff_applied');
    expect(agent).toContain('lead_handoff_skipped');
    expect(agent).toContain('assign_to_user_not_in_org');
    expect(agent).toContain('assign_to_instance_not_active_or_ai_disabled');

    expect(agent).toContain('assistant_identity_source');
    expect(agent).toContain('instance_prompt_override_applied');
    expect(agent).toContain('PERSONALIZACAO_DA_INSTANCIA');

    expect(agent).toContain('policy_call_assign_to_user_id');
    expect(agent).toContain('policy_visit_assign_to_user_id');
    expect(agent).toContain('lead_assigned_to_user_id');
    expect(agent).toContain('v9_assigned_user_source');

    expect(agent).toContain('VENDEDORES_DISPONIVEIS_PARA_ATRIBUICAO');
    expect(agent).toContain('INSTANCIAS_IA_DISPONIVEIS_PARA_HANDOFF');
    expect(agent).toContain('"handoff": {"target_type": "seller"|"instance"');
  });
});
