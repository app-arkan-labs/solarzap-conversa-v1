import { PIPELINE_STAGE_ORDER, getPipelineStageIndex, isBackwardPipelineMove } from '@/hooks/useAutomationSettings';

describe('useAutomationSettings stage order', () => {
  it('keeps nao_compareceu near call/visit cycle (not at the end)', () => {
    const naoCompareceuIndex = getPipelineStageIndex('nao_compareceu');
    const chamadaAgendadaIndex = getPipelineStageIndex('chamada_agendada');
    const aguardandoPropostaIndex = getPipelineStageIndex('aguardando_proposta');

    expect(naoCompareceuIndex).toBeGreaterThan(chamadaAgendadaIndex);
    expect(naoCompareceuIndex).toBeLessThan(aguardandoPropostaIndex);
    expect(PIPELINE_STAGE_ORDER[PIPELINE_STAGE_ORDER.length - 1]).not.toBe('nao_compareceu');
  });

  it('classifies backward moves correctly for skipBackwardMoves checks', () => {
    expect(isBackwardPipelineMove('nao_compareceu', 'chamada_agendada')).toBe(true);
    expect(isBackwardPipelineMove('chamada_agendada', 'nao_compareceu')).toBe(false);
  });
});
