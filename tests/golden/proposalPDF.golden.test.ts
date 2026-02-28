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
import { EXPECTED_PROPOSAL_PDF_HASHES, EXPECTED_PROPOSAL_PDF_HASHES_ADVANCED_FLAGS } from './expectedHashes';

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

type GoldenFlagOverrides = {
  unifiedGeneration?: boolean;
  featureFlags?: Record<string, string | undefined>;
};

const ADVANCED_FLAGS_ON: Record<string, string> = {
  VITE_USE_SOLAR_RESOURCE_API: 'true',
  VITE_USE_OM_COST_MODEL: 'true',
  VITE_USE_DEGRADATION_ALL_CLIENTS: 'true',
  VITE_USE_TUSD_TE_SIMPLIFIED: 'true',
};

const ALL_FLAGS_OFF: Record<string, string> = {
  VITE_USE_SOLAR_RESOURCE_API: 'false',
  VITE_USE_UNIFIED_GENERATION: 'false',
  VITE_USE_OM_COST_MODEL: 'false',
  VITE_USE_DEGRADATION_ALL_CLIENTS: 'false',
  VITE_USE_TUSD_TE_SIMPLIFIED: 'false',
  VITE_USE_FINANCIAL_SHADOW_MODE: 'false',
};

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

async function pdfHashFromFixture(fileName: string, options?: GoldenFlagOverrides): Promise<string> {
  const envUpdates: Record<string, string | undefined> = {
    VITE_USE_UNIFIED_GENERATION: typeof options?.unifiedGeneration === 'boolean'
      ? (options.unifiedGeneration ? 'true' : 'false')
      : undefined,
    ...(options?.featureFlags || {}),
  };
  const previous = new Map<string, string | undefined>();

  Object.entries(envUpdates).forEach(([key, value]) => {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });

  try {
    const fixture = loadFixture(fileName);
    const proposalData = buildProposalData(fixture);
    const blob = generateProposalPDF(proposalData, { now: FIXED_NOW, uuid: FIXED_UUID }) as Blob;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return createHash('sha256').update(bytes).digest('hex');
  } finally {
    previous.forEach((value, key) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

describe('proposal PDF golden master', () => {
  it('residencial A keeps stable hash', async () => {
    const hash = await pdfHashFromFixture('proposal_residencial_A.json', {
      unifiedGeneration: false,
      featureFlags: ALL_FLAGS_OFF,
    });
    expect(hash).toBe(EXPECTED_PROPOSAL_PDF_HASHES.residencialA);
  });

  it('usina B keeps stable hash', async () => {
    const hash = await pdfHashFromFixture('proposal_usina_B.json', {
      unifiedGeneration: false,
      featureFlags: ALL_FLAGS_OFF,
    });
    expect(hash).toBe(EXPECTED_PROPOSAL_PDF_HASHES.usinaB);
  });

  it('keeps identical hash with unified generation OFF and ON for current fixtures', async () => {
    const fixtureFiles = ['proposal_residencial_A.json', 'proposal_usina_B.json'];
    for (const fileName of fixtureFiles) {
      const hashOff = await pdfHashFromFixture(fileName, { unifiedGeneration: false });
      const hashOn = await pdfHashFromFixture(fileName, { unifiedGeneration: true });
      expect(hashOn).toBe(hashOff);
    }
  });

  it('residencial A has expected hash with advanced flags ON', async () => {
    const hash = await pdfHashFromFixture('proposal_residencial_A.json', {
      unifiedGeneration: true,
      featureFlags: ADVANCED_FLAGS_ON,
    });
    expect(hash).toBe(EXPECTED_PROPOSAL_PDF_HASHES_ADVANCED_FLAGS.residencialA);
  });

  it('usina B has expected hash with advanced flags ON', async () => {
    const hash = await pdfHashFromFixture('proposal_usina_B.json', {
      unifiedGeneration: true,
      featureFlags: ADVANCED_FLAGS_ON,
    });
    expect(hash).toBe(EXPECTED_PROPOSAL_PDF_HASHES_ADVANCED_FLAGS.usinaB);
  });
});
