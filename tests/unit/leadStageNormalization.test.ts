import { normalizeLeadStage, resolveImportedPipelineStage } from '@/lib/leadStageNormalization';

describe('leadStageNormalization', () => {
  it('accepts canonical slug values', () => {
    expect(normalizeLeadStage('proposta_negociacao')).toBe('proposta_negociacao');
    expect(normalizeLeadStage('novo_lead')).toBe('novo_lead');
  });

  it('normalizes user-facing titles and accent variants', () => {
    expect(normalizeLeadStage('Novo Lead')).toBe('novo_lead');
    expect(normalizeLeadStage('Proposta em Negociação')).toBe('proposta_negociacao');
    expect(normalizeLeadStage('Não Compareceu')).toBe('nao_compareceu');
  });

  it('falls back to novo_lead for unknown values', () => {
    expect(normalizeLeadStage('etapa_que_nao_existe')).toBe('novo_lead');
    expect(normalizeLeadStage('')).toBe('novo_lead');
    expect(normalizeLeadStage(null)).toBe('novo_lead');
  });

  it('prioritizes stage code when both code and label are provided', () => {
    expect(
      resolveImportedPipelineStage({
        statusPipeline: 'Perdido/Desqualificado',
        statusPipelineCode: 'proposta_pronta',
      }),
    ).toBe('proposta_pronta');
  });
});

