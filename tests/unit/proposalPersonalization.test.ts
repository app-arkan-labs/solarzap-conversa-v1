import { describe, expect, it } from 'vitest';

import { buildPremiumProposalContent } from '@/utils/proposalPersonalization';
import type { Contact } from '@/types/solarzap';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const baseContact: Contact = {
  id: '1',
  name: 'Cliente Teste',
  phone: '5511999999999',
  channel: 'whatsapp',
  pipelineStage: 'aguardando_proposta',
  clientType: 'residencial',
  consumption: 300,
  projectValue: 25000,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastContact: new Date('2026-01-01T00:00:00.000Z'),
};

describe('buildPremiumProposalContent', () => {
  it('prioriza contaLuzMensal no before/after quando informada', () => {
    const result = buildPremiumProposalContent({
      contact: baseContact,
      clientType: 'residencial',
      metrics: {
        consumoMensal: 300,
        contaLuzMensal: 266,
        potenciaSistema: 3.3,
        quantidadePaineis: 6,
        valorTotal: 25000,
        economiaAnual: 3000,
        paybackMeses: 72,
        garantiaAnos: 25,
      },
    });

    expect(result.beforeAfter?.[0]?.before).toBe(formatCurrency(266));
    expect(result.beforeAfter?.[0]?.after).toBe(formatCurrency(16));
  });

  it('mantem fallback heuristico quando contaLuzMensal nao e informada', () => {
    const result = buildPremiumProposalContent({
      contact: baseContact,
      clientType: 'residencial',
      metrics: {
        consumoMensal: 300,
        potenciaSistema: 3.3,
        quantidadePaineis: 6,
        valorTotal: 25000,
        economiaAnual: 3060,
        paybackMeses: 72,
        garantiaAnos: 25,
      },
    });

    expect(result.beforeAfter?.[0]?.before).toBe(formatCurrency(293.25));
    expect(result.beforeAfter?.[0]?.after).toBe(formatCurrency(38.25));
  });
});
