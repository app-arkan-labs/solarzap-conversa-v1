import { describe, expect, it } from 'vitest';
import {
  ACTIVE_PIPELINE_AGENTS,
  DEFAULT_PROMPTS_BY_STAGE,
  INACTIVE_STAGES_REASONS,
} from '@/constants/aiPipelineAgents';
import {
  AI_PIPELINE_STAGE_PROMPTS_PDF,
  getPdfManagedStages,
  isPdfManagedStage,
} from '@/constants/aiPipelinePdfPrompts';

describe('pipeline new agents config', () => {
  it('enables chamada_realizada as active pipeline agent', () => {
    const activeStages = ACTIVE_PIPELINE_AGENTS.map((agent) => agent.stage);
    expect(activeStages).toContain('chamada_realizada');
    expect(activeStages).not.toContain('follow_up');
    expect(activeStages).not.toContain('agente_disparos');
  });

  it('does not keep chamada_realizada as inactive stage', () => {
    expect(INACTIVE_STAGES_REASONS.chamada_realizada).toBeUndefined();
  });

  it('exposes default prompts for new agents', () => {
    expect(DEFAULT_PROMPTS_BY_STAGE.chamada_realizada).toBe(AI_PIPELINE_STAGE_PROMPTS_PDF.chamada_realizada);
    expect(DEFAULT_PROMPTS_BY_STAGE.follow_up).toBe(AI_PIPELINE_STAGE_PROMPTS_PDF.follow_up);
    expect(DEFAULT_PROMPTS_BY_STAGE.agente_disparos).toBe(AI_PIPELINE_STAGE_PROMPTS_PDF.agente_disparos);
  });

  it('keeps follow_up and agente_disparos outside PipelineStage managed list', () => {
    expect(isPdfManagedStage('chamada_realizada')).toBe(true);
    expect(isPdfManagedStage('follow_up')).toBe(true);
    expect(isPdfManagedStage('agente_disparos')).toBe(true);

    const managedStages = getPdfManagedStages() as string[];
    expect(managedStages).toContain('chamada_realizada');
    expect(managedStages).not.toContain('follow_up');
    expect(managedStages).not.toContain('agente_disparos');
  });
});
