import { assertLeadStageUpdateApplied, STAGE_UPDATE_EMPTY_ERROR } from '@/hooks/domain/pipelineStageGuards';

describe('pipelineStageGuards', () => {
  it('throws when update result is empty', () => {
    expect(() => assertLeadStageUpdateApplied([])).toThrow(STAGE_UPDATE_EMPTY_ERROR);
    expect(() => assertLeadStageUpdateApplied(null)).toThrow(STAGE_UPDATE_EMPTY_ERROR);
    expect(() => assertLeadStageUpdateApplied(undefined)).toThrow(STAGE_UPDATE_EMPTY_ERROR);
  });

  it('does not throw when at least one row was updated', () => {
    expect(() => assertLeadStageUpdateApplied([{ id: 1, status_pipeline: 'proposta_pronta' }])).not.toThrow();
  });
});
