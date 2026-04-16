import { describe, expect, it } from 'vitest';
import { createSolarPrimeMockContract } from '@/modules/contracts/lib/mock';
import { renderContractDocument } from '@/modules/contracts/lib/templateEngine';
import {
  assertContractStatusTransition,
  canTransitionContractStatus,
} from '@/modules/contracts/lib/stateMachine';

describe('contract template engine', () => {
  it('renders the real contract template with plan and special annexes', () => {
    const values = createSolarPrimeMockContract();
    const renderResult = renderContractDocument(values);

    expect(renderResult.markdown).toContain('Solar Prime Energia Ltda');
    expect(renderResult.markdown).toContain('Joao Pedro Martins');
    expect(renderResult.markdown).toContain('Plano Implementacao Completa');
    expect(renderResult.markdown).toContain('ANEXO III');
    expect(renderResult.markdown).toContain('ANEXO IV');
    expect(renderResult.markdown).not.toContain('{{');
    expect(renderResult.commercialSummary.condicaoEspecialAtiva).toBe(true);
    expect(renderResult.commercialSummary.landingPage).toBe(true);
    expect(renderResult.commercialSummary.reuniaoExtra).toBe(true);
    expect(renderResult.includedAnnexes).toEqual(['plano_c', 'special']);
  });

  it('allows only valid contract status transitions', () => {
    expect(canTransitionContractStatus('draft', 'review_ready')).toBe(true);
    expect(canTransitionContractStatus('review_ready', 'preview_generated')).toBe(true);
    expect(canTransitionContractStatus('preview_generated', 'pdf_generated')).toBe(true);
    expect(canTransitionContractStatus('draft', 'pdf_generated')).toBe(false);
    expect(() => assertContractStatusTransition('draft', 'pdf_generated')).toThrow();
  });
});
