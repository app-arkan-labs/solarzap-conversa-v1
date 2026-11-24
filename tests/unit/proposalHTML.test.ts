import { describe, expect, it } from 'vitest';
import { generateProposalHTML } from '@/utils/generateProposalHTML';
import { calculateProposalFinancials } from '@/utils/proposalFinancialModel';
import { resolveProposalLinks } from '@/utils/proposalLinks';

const embedded = 'data:image/webp;base64,AA==';
const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

async function render(segment: 'residencial' | 'usina', financing = false) {
  const financialInputs = {
    tipoCliente: segment, investimentoTotal: 12123, consumoMensalKwh: 566,
    contaLuzMensalReferencia: 637, potenciaSistemaKwp: 6.6, tarifaKwh: 1.1,
    custoDisponibilidadeKwh: 50, analysisYears: 25,
  };
  const financialOutputs = calculateProposalFinancials(financialInputs);
  const html = await generateProposalHTML({
    contact: { id: '101', name: '<script>alert(123)</script>', city: 'Curitiba' } as any,
    companyName: 'Luz & Cia', commercialWhatsApp: '(41) 99999-0000',
    issuedAt: new Date('2026-11-24T14:00:00Z'), propNum: 'PROP-AAAA0000',
    tipo_cliente: segment, consumoMensal: 566, contaLuzMensal: 637, potenciaSistema: 6.6,
    quantidadePaineis: 12, valorTotal: 12123, valorAvistaLiquido: 11800, garantiaAnos: 3,
    economiaAnual: financialOutputs.annualRevenueYear1, paybackMeses: financialOutputs.paybackMonths,
    moduloGarantia: 20, inversorGarantia: 10, moduloMarca: 'Marca Teste',
    financialInputs, financialOutputs,
    paymentConditions: financing ? ['pix_avista', 'financiamento_bancario'] : ['pix_avista'],
    showFinancingSimulation: financing,
    financingConditions: financing ? [{
      id: 'bank', institutionName: 'Banco Teste', interestRateMonthly: 1.4,
      installments: [24, 48], gracePeriodValue: 15, gracePeriodUnit: 'dias',
    }] : [],
    coverImageDataUrls: [embedded, embedded, embedded], logoDataUrl: embedded, validadeDias: 12,
  });
  return { html, doc: new DOMParser().parseFromString(html, 'text/html'), financialOutputs };
}

describe('proposta HTML', () => {
  it('incorpora os recursos e os dados da versão residencial sem vazar valores da amostra', async () => {
    const { html, doc, financialOutputs } = await render('residencial');
    expect(doc.title).toBe('PROP-AAAA0000 | Luz & Cia');
    expect(doc.querySelector('.proposal-details strong')?.textContent).toBe('<script>alert(123)</script>');
    expect(doc.querySelectorAll('script')).toHaveLength(1);
    expect(doc.querySelector('script[src], link[rel="stylesheet"], img:not([src^="data:"])')).toBeNull();
    expect(doc.querySelector('.hero-number')?.textContent).toBe(amount.format(financialOutputs.savingsMonthly!));
    expect(doc.querySelector('#year-value')?.textContent).toBe(amount.format(financialOutputs.cumulativeRevenueSeries[24]));
    expect(doc.querySelector('.closing tbody tr:last-child td:last-child')?.textContent).toBe(doc.querySelector('#year-value')?.textContent);
    expect(doc.querySelector('.payment-options label')?.textContent).toContain(amount.format(11800));
    expect(doc.querySelectorAll('.payment-options input')).toHaveLength(1);
    expect(doc.body.textContent?.replace(doc.querySelector('script')!.textContent!, '')).not.toMatch(/Marília|Santander|ARKAN SOLAR|137 mil|PROP-FE9AE459|12345678910/i);
    expect(html).toContain('data-commercial-whatsapp="5541999990000"');
    expect(html).not.toContain('url(\'assets/');
  });

  it('mostra as parcelas selecionadas e usa receita para usinas', async () => {
    const { doc, financialOutputs } = await render('usina', true);
    expect(doc.querySelector('#retorno')).toBeNull();
    expect(doc.querySelector('.panel-label')?.textContent).toBe('Receita mensal estimada');
    expect(doc.querySelector('.hero-number')?.textContent).toBe(amount.format(financialOutputs.monthlyRevenueYear1));
    expect(doc.querySelector('.growth h3')?.textContent).toContain('Receita acumulada');
    expect([...doc.querySelectorAll('.payment-options label span')].map((el) => el.textContent))
      .toEqual(['PIX à vista', 'Banco Teste · 24x', 'Banco Teste · 48x']);
  });

  it('soma a conta residual às parcelas na proposta residencial', async () => {
    const { doc, financialOutputs } = await render('residencial', true);
    const card = doc.querySelector('.payment:not(.featured)')!;
    const rate = 1.4 / 100;
    const installment = 12123 * rate / (1 - Math.pow(1 + rate, -24));
    const monthlyCost = installment + 637 - financialOutputs.savingsMonthly!;
    expect(card.querySelector('strong')?.textContent).toBe(amount.format(installment));
    expect(card.querySelector('.installment-comparison b')?.textContent)
      .toBe(amount.format(monthlyCost) + '/mês');
  });

  it('mantém o link HTML separado do PDF no histórico', () => {
    const shareUrl = 'https://example.test/proposta/abrir#token=example';
    expect(resolveProposalLinks({
      premiumPayload: { documentFormat: 'html', share: { url: shareUrl }, storage: { bucket: 'proposals', path: 'file.html' } },
      supabaseUrl: 'https://example.test',
    })).toEqual({ shareUrl, pdfUrl: null });
  });
});
