import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_ANALYSIS_YEARS, DEFAULT_ANNUAL_INCREASE_PCT, DEFAULT_MODULE_DEGRADATION_PCT } from '@/constants/financialDefaults';
import { FINANCIAL_MODEL_VERSION } from '@/types/proposalFinancial';
import type { Contact } from '@/types/solarzap';
import { generateProposalPDF, type ProposalPDFData } from '@/utils/generateProposalPDF';
import { calculateProposalFinancials } from '@/utils/proposalFinancialModel';
import { calculateSolarSizing } from '@/utils/solarSizing';
import { EXPECTED_PROPOSAL_PDF_HASHES } from './expectedHashes';

interface ProposalFixture {
  contact: {
    name: string;
    phone: string;
    city: string;
    consumption?: number;
  };
  consumoMensal: number;
  irradiancia: number;
  moduloPotencia: number;
  performanceRatio: number;
  precoPorKwp: number;
  tipo_cliente: 'residencial' | 'usina';
  tipoLigacao: 'monofasico' | 'bifasico' | 'trifasico';
  custoDisponibilidadeKwh: number;
  rentabilityRatePerKwh: number;
  tarifaKwh: number;
  garantiaAnos: number;
  validadeDias: number;
  annualEnergyIncreasePct?: number;
  moduleDegradationPct?: number;
  paymentConditions?: string[];
  showFinancingSimulation?: boolean;
  financingConditions?: Array<Record<string, unknown>>;
  abaterCustoDisponibilidadeNoDimensionamento?: boolean;
}

const FIXED_NOW = new Date('2026-01-01T00:00:00Z');
const FIXED_UUID = '00000000-0000-0000-0000-000000000000';

function loadFixture(fileName: string): ProposalFixture {
  const fixturePath = join(process.cwd(), 'tests', 'fixtures', fileName);
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as ProposalFixture;
}

function buildContact(fixture: ProposalFixture, projectValue: number): Contact {
  return {
    id: `fixture-${fixture.tipo_cliente}`,
    name: fixture.contact.name,
    phone: fixture.contact.phone,
    email: '',
    channel: 'whatsapp',
    pipelineStage: 'novo_lead',
    clientType: fixture.tipo_cliente,
    consumption: fixture.consumoMensal,
    projectValue,
    city: fixture.contact.city,
    createdAt: FIXED_NOW,
    lastContact: FIXED_NOW,
  } as Contact;
}

function buildProposalData(fixture: ProposalFixture): ProposalPDFData {
  const sizing = calculateSolarSizing({
    consumoMensal: fixture.consumoMensal,
    irradiancia: fixture.irradiancia,
    moduloPotenciaW: fixture.moduloPotencia,
    performanceRatio: fixture.performanceRatio,
    precoPorKwp: fixture.precoPorKwp,
    tarifaKwh: fixture.tarifaKwh,
    custoDisponibilidadeKwh: fixture.custoDisponibilidadeKwh,
    aplicarCustoDisponibilidadeNoDimensionamento: Boolean(fixture.abaterCustoDisponibilidadeNoDimensionamento),
  });

  const financialInputs = {
    tipoCliente: fixture.tipo_cliente,
    investimentoTotal: sizing.valorTotal,
    consumoMensalKwh: fixture.consumoMensal,
    potenciaSistemaKwp: sizing.potenciaSistemaKwp,
    rentabilityRatePerKwh: fixture.rentabilityRatePerKwh,
    tarifaKwh: fixture.tarifaKwh,
    custoDisponibilidadeKwh: fixture.custoDisponibilidadeKwh,
    abaterCustoDisponibilidadeNoDimensionamento: Boolean(fixture.abaterCustoDisponibilidadeNoDimensionamento),
    annualEnergyIncreasePct: fixture.annualEnergyIncreasePct ?? DEFAULT_ANNUAL_INCREASE_PCT,
    moduleDegradationPct: fixture.moduleDegradationPct ?? DEFAULT_MODULE_DEGRADATION_PCT,
    analysisYears: DEFAULT_ANALYSIS_YEARS,
  };
  const financialOutputs = calculateProposalFinancials(financialInputs);

  return {
    contact: buildContact(fixture, sizing.valorTotal),
    consumoMensal: fixture.consumoMensal,
    potenciaSistema: sizing.potenciaSistemaKwp,
    quantidadePaineis: sizing.quantidadePaineis,
    valorTotal: sizing.valorTotal,
    economiaAnual: financialOutputs.annualRevenueYear1,
    paybackMeses: financialOutputs.paybackMonths,
    garantiaAnos: fixture.garantiaAnos,
    tipo_cliente: fixture.tipo_cliente,
    tipoLigacao: fixture.tipoLigacao,
    rentabilityRatePerKwh: fixture.rentabilityRatePerKwh,
    tarifaKwh: fixture.tarifaKwh,
    custoDisponibilidadeKwh: fixture.custoDisponibilidadeKwh,
    paymentConditions: (fixture.paymentConditions || []) as any,
    showFinancingSimulation: Boolean(fixture.showFinancingSimulation),
    financingConditions: (fixture.financingConditions || []) as any,
    validadeDias: fixture.validadeDias,
    annualEnergyIncreasePct: fixture.annualEnergyIncreasePct,
    moduleDegradationPct: fixture.moduleDegradationPct,
    financialInputs,
    financialOutputs,
    financialModelVersion: FINANCIAL_MODEL_VERSION,
    moduloPotencia: fixture.moduloPotencia,
    moduloGarantia: 25,
    inversorGarantia: 10,
    returnBlob: true,
  };
}

async function pdfHashFromFixture(fileName: string, unifiedGeneration?: boolean): Promise<string> {
  const previous = process.env.VITE_USE_UNIFIED_GENERATION;
  if (typeof unifiedGeneration === 'boolean') {
    process.env.VITE_USE_UNIFIED_GENERATION = unifiedGeneration ? 'true' : 'false';
  } else {
    delete process.env.VITE_USE_UNIFIED_GENERATION;
  }

  try {
    const fixture = loadFixture(fileName);
    const proposalData = buildProposalData(fixture);
    const blob = generateProposalPDF(proposalData, { now: FIXED_NOW, uuid: FIXED_UUID }) as Blob;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return createHash('sha256').update(bytes).digest('hex');
  } finally {
    if (previous === undefined) delete process.env.VITE_USE_UNIFIED_GENERATION;
    else process.env.VITE_USE_UNIFIED_GENERATION = previous;
  }
}

describe('proposal PDF golden master', () => {
  it('residencial A mantém hash estável', async () => {
    const hash = await pdfHashFromFixture('proposal_residencial_A.json', false);
    expect(hash).toBe(EXPECTED_PROPOSAL_PDF_HASHES.residencialA);
  });

  it('usina B mantém hash estável', async () => {
    const hash = await pdfHashFromFixture('proposal_usina_B.json', false);
    expect(hash).toBe(EXPECTED_PROPOSAL_PDF_HASHES.usinaB);
  });

  it('mantém PDF idêntico com flag OFF e ON para as fixtures atuais', async () => {
    const fixtureFiles = ['proposal_residencial_A.json', 'proposal_usina_B.json'];
    for (const fileName of fixtureFiles) {
      const hashOff = await pdfHashFromFixture(fileName, false);
      const hashOn = await pdfHashFromFixture(fileName, true);
      expect(hashOn).toBe(hashOff);
    }
  });
});
