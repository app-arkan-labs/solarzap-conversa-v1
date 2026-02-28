import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Contact } from '@/types/solarzap';
import {
  type PremiumProposalContent,
  type EquipmentSpec,
  type NextStepDetailed,
  type EnvironmentalImpact,
} from '@/utils/proposalPersonalization';
import {
  type ProposalColorTheme,
  getThemeById,
  parseThemeHexToRgb,
} from '@/utils/proposalColorThemes';
import {
  drawSavingsBarChart,
  drawRevenueBarChart,
  drawCumulativeSavingsChart,
  drawROIPieChart,
  drawEnvironmentalImpact as drawEnvChart,
  drawMonthlyGenerationChart,
  drawBeforeAfterComparison,
  calcEnvironmentalImpact,
  calcMonthlyGeneration,
  type ChartTheme,
} from '@/utils/proposalCharts';
import {
  PAYMENT_CONDITION_LABEL_BY_ID,
  type FinancingCondition,
  type PaymentConditionOptionId,
} from '@/types/proposalFinancing';
import type { FinancialInputs, FinancialOutputs } from '@/types/proposalFinancial';
import { calculateProposalFinancials } from '@/utils/proposalFinancialModel';
import {
  DEFAULT_ANALYSIS_YEARS,
  DEFAULT_ANNUAL_INCREASE_PCT,
  DEFAULT_MODULE_DEGRADATION_PCT,
  DEFAULT_RENTABILITY_RATE_PER_KWH,
} from '@/constants/financialDefaults';

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// INTERFACES
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

export interface ProposalPDFData {
  contact: Contact;
  consumoMensal: number;
  potenciaSistema: number;
  quantidadePaineis: number;
  valorTotal: number;
  economiaAnual: number;
  paybackMeses: number;
  garantiaAnos: number;
  observacoes?: string;
  tipo_cliente?: string;
  tipoLigacao?: 'monofasico' | 'bifasico' | 'trifasico';
  rentabilityRatePerKwh?: number;
  tarifaKwh?: number;
  custoDisponibilidadeKwh?: number;
  premiumContent?: PremiumProposalContent;
  taxaFinanciamento?: number;
  parcela36x?: number;
  parcela60x?: number;
  paymentConditions?: PaymentConditionOptionId[];
  financingConditions?: FinancingCondition[];
  financingPrimaryInstitutionId?: string;
  showFinancingSimulation?: boolean;
  secondaryColorHex?: string | null;
  validadeDias?: number;
  annualEnergyIncreasePct?: number;
  moduleDegradationPct?: number;
  financialInputs?: FinancialInputs;
  financialOutputs?: FinancialOutputs;
  financialModelVersion?: string;
  colorTheme?: ProposalColorTheme;
  returnBlob?: boolean;
  propNum?: string;
  logoDataUrl?: string | null;
  // Kit Fotovoltaico
  moduloNome?: string;
  moduloMarca?: string;
  moduloPotencia?: number;
  moduloGarantia?: number;
  moduloTipo?: string;
  inversorNome?: string;
  inversorMarca?: string;
  inversorPotencia?: number;
  inversorTensao?: number;
  inversorGarantia?: number;
  inversorQtd?: number;
  estruturaTipo?: string;
  signatureCompanyName?: string;
  signatureCompanyCnpj?: string;
  signatureContractorName?: string;
  signatureContractorCnpj?: string;
}

export interface SellerScriptPDFData {
  contact: Contact;
  consumoMensal: number;
  potenciaSistema: number;
  quantidadePaineis: number;
  valorTotal: number;
  economiaAnual: number;
  paybackMeses: number;
  garantiaAnos: number;
  tipo_cliente?: string;
  tipoLigacao?: 'monofasico' | 'bifasico' | 'trifasico';
  rentabilityRatePerKwh?: number;
  tarifaKwh?: number;
  custoDisponibilidadeKwh?: number;
  premiumContent?: PremiumProposalContent;
  taxaFinanciamento?: number;
  parcela36x?: number;
  parcela60x?: number;
  paymentConditions?: PaymentConditionOptionId[];
  financingConditions?: FinancingCondition[];
  financingPrimaryInstitutionId?: string;
  showFinancingSimulation?: boolean;
  secondaryColorHex?: string | null;
  validadeDias?: number;
  annualEnergyIncreasePct?: number;
  moduleDegradationPct?: number;
  financialInputs?: FinancialInputs;
  financialOutputs?: FinancialOutputs;
  financialModelVersion?: string;
  returnBlob?: boolean;
  propNum?: string;
  colorTheme?: ProposalColorTheme;
  logoDataUrl?: string | null;
  signatureCompanyName?: string;
  signatureCompanyCnpj?: string;
  signatureContractorName?: string;
  signatureContractorCnpj?: string;
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

import { calcPMT } from '@/utils/financingCalc';

type RGB = [number, number, number];

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHsl([rRaw, gRaw, bRaw]: RGB): [number, number, number] {
  const r = rRaw / 255;
  const g = gRaw / 255;
  const b = bRaw / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, l];
}

function hueToRgb(p: number, q: number, tRaw: number): number {
  let t = tRaw;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(hRaw: number, s: number, l: number): RGB {
  const h = ((hRaw % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = clamp255(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    clamp255(hueToRgb(p, q, h + 1 / 3) * 255),
    clamp255(hueToRgb(p, q, h) * 255),
    clamp255(hueToRgb(p, q, h - 1 / 3) * 255),
  ];
}

function mixToward(base: RGB, target: RGB, alpha: number): RGB {
  return [
    clamp255(base[0] * (1 - alpha) + target[0] * alpha),
    clamp255(base[1] * (1 - alpha) + target[1] * alpha),
    clamp255(base[2] * (1 - alpha) + target[2] * alpha),
  ];
}

/** Derive a readable complementary color from a given theme color. */
function deriveComplementary(base: RGB): RGB {
  const [h, s, l] = rgbToHsl(base);
  const complementHue = (h + 180) % 360;
  const safeS = Math.max(0.48, Math.min(0.78, s || 0.58));
  const safeL = Math.max(0.34, Math.min(0.52, l));
  return hslToRgb(complementHue, safeS, safeL);
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Tarifa e custo de disponibilidade (ANEEL) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/** Custo de disponibilidade em kWh por tipo de conexÃƒÂ£o/cliente (ANEEL REN 1.000/2021) */
function getCustoDisponibilidadeFallback(tipoCliente?: string): number {
  switch (tipoCliente?.toLowerCase()) {
    case 'residencial': return 50;   // bifÃƒÂ¡sico (padrÃƒÂ£o residencial)
    case 'comercial': return 100;  // trifÃƒÂ¡sico
    case 'industrial': return 100;  // trifÃƒÂ¡sico
    case 'rural': return 30;   // monofÃƒÂ¡sico
    default: return 50;
  }
}

function getCustoDisponibilidadeByLigacao(tipoLigacao?: string): number | null {
  switch (String(tipoLigacao || '').toLowerCase()) {
    case 'monofasico': return 30;
    case 'bifasico': return 50;
    case 'trifasico': return 100;
    default: return null;
  }
}

/** Detect image format from data URL or file extension for jsPDF addImage */
function detectImageFormat(src: string): string {
  if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) return 'JPEG';
  if (src.startsWith('data:image/png')) return 'PNG';
  if (src.startsWith('data:image/webp')) return 'WEBP';
  // Fallback: check file extension
  const lower = src.toLowerCase();
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'JPEG';
  if (lower.includes('.webp')) return 'WEBP';
  return 'PNG'; // default
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtNumber = (v: number) =>
  new Intl.NumberFormat('pt-BR').format(v);
const fmtDecimal = (v: number, minimumFractionDigits = 2, maximumFractionDigits = 2) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits, maximumFractionDigits }).format(v);

function fmtYears(months: number): string {
  if (!months || months <= 0) return '-';
  const years = months / 12;
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(years)} anos`;
}

function fmtYearsAndMonths(monthsRaw: number): string {
  const totalMonths = Math.max(0, Math.round(Number(monthsRaw) || 0));
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return `${years} anos e ${months} meses`;
}

interface FinancingRow {
  institutionName: string;
  installment: number;
  installmentValue: number;
  interestRateMonthly: number;
  gracePeriodLabel: string;
  isPrimary: boolean;
}

function formatGracePeriod(value: number, unit: 'dias' | 'meses'): string {
  const safeValue = Math.max(0, Number(value) || 0);
  const safeUnit = unit === 'meses' ? 'meses' : 'dias';
  if (safeValue <= 0) return `0 ${safeUnit}`;
  return `${safeValue} ${safeUnit}`;
}

function paymentConditionLabelsFromIds(paymentConditions?: PaymentConditionOptionId[]): string[] {
  const ids = Array.isArray(paymentConditions) ? paymentConditions : [];
  return Array.from(new Set(ids)).map((id) => PAYMENT_CONDITION_LABEL_BY_ID[id] || id);
}

function buildFinancingRows(data: {
  valorTotal: number;
  financingConditions?: FinancingCondition[];
  financingPrimaryInstitutionId?: string;
}): FinancingRow[] {
  if (!Array.isArray(data.financingConditions) || data.financingConditions.length === 0) return [];
  const normalized = data.financingConditions
    .map((condition) => ({
      id: condition.id || '',
      institutionName: String(condition.institutionName || '').trim(),
      interestRateMonthly: Number(condition.interestRateMonthly) || 0,
      installments: Array.from(new Set((condition.installments || [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0))).sort((a, b) => a - b),
      gracePeriodValue: Math.max(0, Number(condition.gracePeriodValue) || 0),
      gracePeriodUnit: (condition.gracePeriodUnit === 'meses' ? 'meses' : 'dias') as 'dias' | 'meses',
    }))
    .filter((condition) => condition.institutionName && condition.interestRateMonthly > 0 && condition.installments.length > 0);

  if (normalized.length === 0 || data.valorTotal <= 0) return [];
  const primaryId = normalized.some((condition) => condition.id === data.financingPrimaryInstitutionId)
    ? data.financingPrimaryInstitutionId
    : normalized[0].id;

  return normalized.flatMap((condition) => condition.installments.map((installment) => ({
    institutionName: condition.institutionName,
    installment,
    installmentValue: calcPMT(condition.interestRateMonthly, installment, data.valorTotal),
    interestRateMonthly: condition.interestRateMonthly,
    gracePeriodLabel: formatGracePeriod(condition.gracePeriodValue, condition.gracePeriodUnit),
    isPrimary: condition.id === primaryId,
  })));
}

function resolveFinancing(data: {
  taxaFinanciamento?: number;
  parcela36x?: number;
  parcela60x?: number;
  valorTotal: number;
  financingConditions?: FinancingCondition[];
  financingPrimaryInstitutionId?: string;
  showFinancingSimulation?: boolean;
}) {
  const financingRows = buildFinancingRows(data);
  if (financingRows.length > 0) {
    const primaryRows = financingRows.filter((row) => row.isPrimary);
    const baseRows = primaryRows.length > 0 ? primaryRows : financingRows;
    const row36 = baseRows.find((row) => row.installment === 36);
    const row60 = baseRows.find((row) => row.installment === 60);
    const row24 = baseRows.find((row) => row.installment === 24);
    return {
      pmt24: row24?.installmentValue || 0,
      pmt36: row36?.installmentValue || 0,
      pmt60: row60?.installmentValue || 0,
      taxa: baseRows[0]?.interestRateMonthly || 0,
      showFinancing: true,
      isManual: false,
      financingRows,
    };
  }

  if (data.showFinancingSimulation === false) {
    return {
      pmt24: 0,
      pmt36: 0,
      pmt60: 0,
      taxa: 0,
      showFinancing: false,
      isManual: false,
      financingRows: [] as FinancingRow[],
    };
  }

  const has36 = data.parcela36x && data.parcela36x > 0;
  const has60 = data.parcela60x && data.parcela60x > 0;
  const taxa = data.taxaFinanciamento && data.taxaFinanciamento > 0 ? data.taxaFinanciamento : 0;

  const pmt36 = has36 ? data.parcela36x! : taxa > 0 ? calcPMT(taxa, 36, data.valorTotal) : 0;
  const pmt60 = has60 ? data.parcela60x! : taxa > 0 ? calcPMT(taxa, 60, data.valorTotal) : 0;
  const pmt24 = taxa > 0 ? calcPMT(taxa, 24, data.valorTotal) : 0;

  const showFinancing = pmt36 > 0 || pmt60 > 0;
  const isManual = !!(has36 || has60);

  const fallbackRows: FinancingRow[] = [];
  if (pmt36 > 0) {
    fallbackRows.push({
      institutionName: 'Financiamento',
      installment: 36,
      installmentValue: pmt36,
      interestRateMonthly: taxa,
      gracePeriodLabel: '0 dias',
      isPrimary: true,
    });
  }
  if (pmt60 > 0) {
    fallbackRows.push({
      institutionName: 'Financiamento',
      installment: 60,
      installmentValue: pmt60,
      interestRateMonthly: taxa,
      gracePeriodLabel: '0 dias',
      isPrimary: true,
    });
  }

  return { pmt24, pmt36, pmt60, taxa, showFinancing, isManual, financingRows: fallbackRows };
}

function buildTermsConditionsFromSelection(params: {
  consumoMensal: number;
  potenciaSistema: number;
  isUsina: boolean;
  validadeDias: number;
  moduloGarantia?: number;
  inversorGarantia?: number;
  garantiaServicos?: number;
  paymentConditionLabels: string[];
  financingSelected: boolean;
  showFinancingSimulation: boolean;
}): string[] {
  const paymentText = params.paymentConditionLabels.length > 0
    ? `Condicoes de pagamento selecionadas: ${params.paymentConditionLabels.join(', ')}.`
    : 'Condicoes de pagamento sob consulta comercial.';
  const financingClause = params.financingSelected
    ? (params.showFinancingSimulation
      ? 'A simulacao de financiamento apresentada e comercial, sujeita a analise e aprovacao de credito pela instituicao financeira.'
      : 'Financiamento bancario pode ser contratado como forma de pagamento, sujeito a analise e aprovacao de credito.')
    : '';

  return [
    `Validade desta proposta: ${Math.max(1, Math.round(params.validadeDias || 15))} dias corridos a partir da data de emissao.`,
    params.isUsina
      ? `Os valores apresentados sao estimativas baseadas na potencia projetada de ${fmtDecimal(params.potenciaSistema, 1, 2)} kWp e estao sujeitos a vistoria tecnica.`
      : `Os valores apresentados sao estimativas baseadas no consumo informado de ${fmtNumber(params.consumoMensal)} kWh/mes e estao sujeitos a vistoria tecnica.`,
    'O dimensionamento segue as normas da ANEEL e da Lei 14.300/2022 (geracao distribuida).',
    params.isUsina
      ? 'A receita projetada considera a tarifa vigente e pode variar conforme reajustes tarifarios e condicoes contratuais.'
      : 'A economia projetada considera a tarifa vigente e pode variar conforme reajustes tarifarios.',
    `Garantia dos equipamentos e servicos: modulo (${params.moduloGarantia || 25} anos), inversor (${params.inversorGarantia || 10} anos) e servicos (${params.garantiaServicos || 25} anos).`,
    'A instalacao inclui projeto eletrico, instalacao mecanica e eletrica, comissionamento e solicitacao de vistoria junto a concessionaria.',
    'Prazo estimado de instalacao: 7 a 15 dias uteis apos aprovacao do projeto e disponibilidade de materiais.',
    paymentText,
    financingClause,
  ].filter(Boolean);
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Theme-aware color palette Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

interface Palette {
  header: RGB; accent: RGB; teal: RGB; lightBg: RGB; cardBg: RGB;
  bodyText: RGB; white: RGB; lightGray: RGB;
  red: RGB; redLight: RGB; redBorder: RGB; warningText: RGB;
  accentComplement: RGB;
  gold: RGB; headerText: RGB;
}

function buildPalette(theme?: ProposalColorTheme | null, secondaryColorHex?: string | null): Palette {
  const t = theme || getThemeById(null);
  const accentComplement = parseThemeHexToRgb(secondaryColorHex || '') || deriveComplementary(t.primary);
  return {
    header: t.primary,
    accent: t.primaryDark,
    teal: t.primary,
    lightBg: t.primaryLight,
    cardBg: [
      clamp255(t.primaryLight[0] - 8),
      clamp255(t.primaryLight[1] - 8),
      clamp255(t.primaryLight[2] - 8),
    ] as RGB,
    bodyText: [70, 84, 103] as RGB,
    white: [255, 255, 255] as RGB,
    lightGray: [222, 227, 235] as RGB,
    red: [220, 38, 38] as RGB,
    redLight: [255, 245, 245] as RGB,
    redBorder: [220, 38, 38] as RGB,
    warningText: [127, 29, 29] as RGB,
    accentComplement,
    gold: accentComplement,
    headerText: t.primaryText,
  };
}

function buildChartTheme(P: Palette): ChartTheme {
  const accentAlt = mixToward(P.accentComplement, [255, 255, 255], 0.2);
  return {
    primary: P.teal,
    primaryDark: P.header,
    primaryLight: P.lightBg,
    accent: P.accentComplement,
    accentAlt,
    text: [30, 41, 59] as RGB,
    textLight: [100, 116, 139] as RGB,
    gridLine: P.lightGray,
    white: P.white,
    green: [22, 163, 74] as RGB,
    red: P.red,
    gold: P.accentComplement,
  };
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Accent sanitisation for Helvetica (standard 14 font Ã¢â‚¬â€ no Unicode glyphs) Ã¢â€â‚¬Ã¢â€â‚¬
/** Transliterate common Portuguese/Spanish accented chars so Helvetica can render them. */
function repairMojibake(text: string): string {
  if (!/[ÃÂâ]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8').decode(bytes);
    const badOriginal = (text.match(/[ÃÂâ]/g) || []).length;
    const badDecoded = (decoded.match(/[ÃÂâ]/g) || []).length;
    return badDecoded < badOriginal ? decoded : text;
  } catch {
    return text;
  }
}

function sanitizeForPDF(text: string): string {
  if (!text) return '';
  const repaired = repairMojibake(text);

  return repaired
    .replace(/[\u2013\u2014]/g, '-')   // en/em dash
    .replace(/[\u2018\u2019]/g, "'")   // curly single quotes
    .replace(/[\u201C\u201D]/g, '"')   // curly double quotes
    .replace(/\u2026/g, '...')         // ellipsis
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // remove diacritics
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ''); // keep printable ASCII + tab/new lines
}

function sanitizePdfTextInput(input: unknown): unknown {
  if (typeof input === 'string') return sanitizeForPDF(input);
  if (Array.isArray(input)) {
    return input.map((item) => (typeof item === 'string' ? sanitizeForPDF(item) : item));
  }
  return input;
}

function applyPdfTextSanitizers(doc: jsPDF): void {
  const originalText = doc.text.bind(doc);
  doc.text = ((text: any, ...rest: any[]) => {
    return (originalText as any)(sanitizePdfTextInput(text), ...rest);
  }) as typeof doc.text;

  const originalSplitTextToSize = doc.splitTextToSize.bind(doc);
  doc.splitTextToSize = ((text: any, ...rest: any[]) => {
    return (originalSplitTextToSize as any)(sanitizePdfTextInput(text), ...rest);
  }) as typeof doc.splitTextToSize;
}

// Ã¢â€â‚¬Ã¢â€â‚¬ AI text sanity check Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
/** Returns true if the AI-generated text looks usable (not too short/long/garbled). */
function isSensibleAiText(text: string | undefined | null, label = 'AI text'): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 24 || trimmed.length > 190) {
    console.warn(`[PDF] ${label} rejected (length=${trimmed.length}): "${trimmed.slice(0, 60)}..."`);
    return false;
  }
  return true;
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// CLIENT-FACING PROPOSAL PDF (5+ PAGES)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

export function generateProposalPDF(data: ProposalPDFData): Blob | void {
  const doc = new jsPDF();

  // Auto-sanitise text for Helvetica (no Unicode support).
  applyPdfTextSanitizers(doc);

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  let y = 0;

  const C = buildPalette(data.colorTheme, data.secondaryColorHex);
  const chartTheme = buildChartTheme(C);
  const premium = data.premiumContent;
  const isUsina = (data.tipo_cliente || '').toLowerCase() === 'usina';
  const propNum = data.propNum || `PROP-${Date.now().toString().slice(-8)}`;
  const validadeDias = data.validadeDias && data.validadeDias > 0 ? data.validadeDias : 15;
  const fallbackCustoDisponibilidade = getCustoDisponibilidadeByLigacao(data.tipoLigacao)
    ?? getCustoDisponibilidadeByLigacao(data.contact.connectionType)
    ?? getCustoDisponibilidadeFallback(data.tipo_cliente);
  const resolvedRentabilityRate = Math.max(
    0,
    Number(
      data.rentabilityRatePerKwh
      ?? data.financialInputs?.rentabilityRatePerKwh
      ?? data.financialInputs?.tarifaKwh
      ?? data.tarifaKwh
      ?? DEFAULT_RENTABILITY_RATE_PER_KWH,
    ) || 0,
  );
  const resolvedFinancialInputs: FinancialInputs = {
    tipoCliente: data.tipo_cliente,
    investimentoTotal: Math.max(0, Number(data.valorTotal) || 0),
    consumoMensalKwh: Math.max(0, Number(data.consumoMensal) || 0),
    potenciaSistemaKwp: Math.max(0, Number(data.potenciaSistema) || 0),
    rentabilityRatePerKwh: resolvedRentabilityRate,
    tarifaKwh: resolvedRentabilityRate,
    rentabilitySource: data.financialInputs?.rentabilitySource || data.financialInputs?.tariffSource || 'fallback',
    tariffSource: data.financialInputs?.tariffSource || data.financialInputs?.rentabilitySource || 'fallback',
    custoDisponibilidadeKwh: Math.max(
      0,
      Number(data.custoDisponibilidadeKwh ?? data.financialInputs?.custoDisponibilidadeKwh ?? fallbackCustoDisponibilidade) || 0,
    ),
    abaterCustoDisponibilidadeNoDimensionamento: Boolean(
      data.financialInputs?.abaterCustoDisponibilidadeNoDimensionamento,
    ),
    annualEnergyIncreasePct: Number(
      data.annualEnergyIncreasePct ?? data.financialInputs?.annualEnergyIncreasePct ?? DEFAULT_ANNUAL_INCREASE_PCT,
    ) || DEFAULT_ANNUAL_INCREASE_PCT,
    moduleDegradationPct: Number(
      data.moduleDegradationPct ?? data.financialInputs?.moduleDegradationPct ?? DEFAULT_MODULE_DEGRADATION_PCT,
    ) || DEFAULT_MODULE_DEGRADATION_PCT,
    analysisYears: Math.max(
      1,
      Number(data.financialInputs?.analysisYears || DEFAULT_ANALYSIS_YEARS) || DEFAULT_ANALYSIS_YEARS,
    ),
  };
  const hasFinancialSnapshot = Boolean(
    data.financialOutputs
    && Number.isFinite(data.financialOutputs.annualRevenueYear1)
    && data.financialOutputs.annualRevenueYear1 >= 0
    && Number.isFinite(data.financialOutputs.paybackMonths)
    && (
      isUsina
      || (
        Number.isFinite(data.financialOutputs.billBeforeMonthly as number)
        && Number.isFinite(data.financialOutputs.billAfterMonthly as number)
        && Number.isFinite(data.financialOutputs.savingsMonthly as number)
      )
    ),
  );
  const financialOutputs: FinancialOutputs = hasFinancialSnapshot
    ? (data.financialOutputs as FinancialOutputs)
    : calculateProposalFinancials(resolvedFinancialInputs);
  const econAnualRaw = (financialOutputs?.annualRevenueYear1 ?? 0) > 0
    ? (financialOutputs?.annualRevenueYear1 || 0)
    : data.economiaAnual;
  const econMensalRaw = (financialOutputs?.monthlyRevenueYear1 ?? 0) > 0
    ? (financialOutputs?.monthlyRevenueYear1 || 0)
    : (econAnualRaw / 12);
  const econAnual = !isUsina && Number.isFinite(financialOutputs.savingsAnnual as number)
    ? (financialOutputs.savingsAnnual as number)
    : econAnualRaw;
  const econMensal = !isUsina && Number.isFinite(financialOutputs.savingsMonthly as number)
    ? (financialOutputs.savingsMonthly as number)
    : econMensalRaw;
  const cumulative25 = Array.isArray(financialOutputs?.cumulativeRevenueSeries)
    ? (financialOutputs?.cumulativeRevenueSeries?.[24]
      ?? financialOutputs?.cumulativeRevenueSeries?.[financialOutputs.cumulativeRevenueSeries.length - 1]
      ?? 0)
    : 0;
  const longTermSavings = cumulative25 > 0 ? cumulative25 : (econAnual * 25);
  const paybackMonths = (financialOutputs?.paybackMonths ?? 0) > 0
    ? (financialOutputs?.paybackMonths || 0)
    : data.paybackMeses;
  const paybackYears = fmtYears(paybackMonths);
  const paybackYearsDetailed = financialOutputs?.paybackLabelYearsMonths || fmtYearsAndMonths(paybackMonths);
  const paybackYearsNumber = (financialOutputs?.paybackYearsDecimal ?? 0) > 0
    ? (financialOutputs?.paybackYearsDecimal || 0)
    : (paybackMonths > 0 ? paybackMonths / 12 : 0);
  const roi25Pct = data.valorTotal > 0
    ? (((longTermSavings - data.valorTotal) / data.valorTotal) * 100)
    : 0;
  const roi25 = data.valorTotal > 0 ? `${roi25Pct.toFixed(1)}%` : '-';
  const cumulativeSeries = Array.isArray(financialOutputs?.cumulativeRevenueSeries)
    ? financialOutputs!.cumulativeRevenueSeries
    : [];
  const cumulativeAtYear = (year: number) => {
    const safeYear = Math.max(1, Math.round(year));
    if (cumulativeSeries.length >= safeYear) return cumulativeSeries[safeYear - 1] || 0;
    return econAnual * safeYear;
  };
  const receita5Anos = cumulativeAtYear(5);
  const receita15Anos = cumulativeAtYear(15);
  const retornoPorReal = data.valorTotal > 0
    ? ((financialOutputs?.retornoPorReal ?? 0) > 0
      ? (financialOutputs?.retornoPorReal || 0)
      : (longTermSavings / data.valorTotal))
    : 0;
  const segLabel = (data.tipo_cliente || 'residencial').charAt(0).toUpperCase() + (data.tipo_cliente || 'residencial').slice(1);
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // logoDataUrl should always be a valid data:image/... string from useProposalLogo
  const logoSrc = data.logoDataUrl || null;
  const envImpact: EnvironmentalImpact = premium?.environmentalImpact
    || calcEnvironmentalImpact(data.consumoMensal * 12, 25);
  const fallbackMonthlyGen = calcMonthlyGeneration(data.potenciaSistema, data.consumoMensal);
  const premiumMonthlyGen = Array.isArray(premium?.monthlyGeneration)
    ? premium.monthlyGeneration.slice(0, 12).map((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    })
    : null;
  const monthlySpread = premiumMonthlyGen && premiumMonthlyGen.length === 12
    ? (Math.max(...premiumMonthlyGen) - Math.min(...premiumMonthlyGen))
      / Math.max(1, premiumMonthlyGen.reduce((acc, v) => acc + v, 0) / premiumMonthlyGen.length)
    : 0;
  const monthlyGen: number[] = premiumMonthlyGen && monthlySpread >= 0.25
    ? premiumMonthlyGen
    : fallbackMonthlyGen;
  const annualGenerationKwh = monthlyGen.reduce((acc, value) => acc + Math.max(0, Number(value) || 0), 0);
  const avgMonthlyGenerationKwh = annualGenerationKwh / 12;
  const retornoPorKwpAno = (financialOutputs?.retornoPorKwpAno ?? 0) > 0
    ? (financialOutputs?.retornoPorKwpAno || 0)
    : (data.potenciaSistema > 0 ? (econAnual / data.potenciaSistema) : 0);
  const retornoPorKwh = (financialOutputs?.retornoPorKwh ?? 0) > 0
    ? (financialOutputs?.retornoPorKwh || 0)
    : (annualGenerationKwh > 0 ? (econAnual / annualGenerationKwh) : 0);
  const equipSpecs: EquipmentSpec[] = premium?.equipmentSpecs || [
    { item: 'Modulos Fotovoltaicos', spec: 'Monocristalino 550W+ Tier 1', qty: data.quantidadePaineis, warranty: '12 anos produto / 25 anos performance' },
    { item: 'Inversor', spec: 'On-Grid alta eficiencia (>97%)', qty: 1, warranty: '10 anos' },
    { item: 'Estrutura de Fixacao', spec: 'Aluminio anodizado', qty: `${data.quantidadePaineis} conjuntos`, warranty: '15 anos' },
    { item: 'Cabos e Conectores', spec: 'Solar CC 6mm\u00B2 + MC4', qty: 'Kit completo', warranty: '10 anos' },
    { item: 'String Box / Protecao', spec: 'DPS + chave seccionadora CC/CA', qty: 1, warranty: '5 anos' },
  ];
  // Conta mensal real: consumo Ãƒâ€” tarifa mÃƒÂ©dia
  const contaEstimada = !isUsina
    ? (Number(financialOutputs.billBeforeMonthly) || (data.consumoMensal * resolvedRentabilityRate))
    : 0;
  const contaComSolar = !isUsina
    ? (Number(financialOutputs.billAfterMonthly)
      || (Math.min(data.consumoMensal, resolvedFinancialInputs.custoDisponibilidadeKwh || 0) * resolvedRentabilityRate))
    : 0;
  if (!isUsina) {
    const diff = Math.abs((contaEstimada - contaComSolar) - econMensal);
    if (diff > 0.01) {
      console.warn('[proposal-pdf] Incoerencia financeira detectada no comparativo.', { diff });
    }
  }
  const paymentConditionLabels = paymentConditionLabelsFromIds(data.paymentConditions);
  const financingSelected = Array.isArray(data.paymentConditions)
    ? data.paymentConditions.includes('financiamento_bancario')
    : false;
  const hasLegacyFinancingData = (Number(data.taxaFinanciamento) || 0) > 0
    || (Number(data.parcela36x) || 0) > 0
    || (Number(data.parcela60x) || 0) > 0
    || (Array.isArray(data.financingConditions) && data.financingConditions.length > 0);
  const showFinancingSimulation = financingSelected
    && (typeof data.showFinancingSimulation === 'boolean' ? data.showFinancingSimulation : hasLegacyFinancingData);
  const termsConditions: string[] = buildTermsConditionsFromSelection({
    consumoMensal: data.consumoMensal,
    potenciaSistema: data.potenciaSistema,
    isUsina,
    validadeDias,
    moduloGarantia: data.moduloGarantia,
    inversorGarantia: data.inversorGarantia,
    garantiaServicos: data.garantiaAnos,
    paymentConditionLabels,
    financingSelected,
    showFinancingSimulation,
  });
  const nextSteps: NextStepDetailed[] = premium?.nextStepsDetailed || [
    { step: 'Aprovacao da Proposta', description: 'Confirmacao dos termos e assinatura.' },
    { step: 'Vistoria Tecnica', description: 'Visita para validacao do local.' },
    { step: 'Projeto Executivo', description: 'Projeto eletrico e registro na concessionaria.' },
    { step: 'Instalacao', description: 'Montagem e comissionamento do sistema.' },
    { step: 'Homologacao', description: 'Vistoria da concessionaria e troca do medidor.' },
    { step: 'Geracao', description: 'Sistema ativo gerando economia!' },
  ];
  const fin = resolveFinancing({ ...data, showFinancingSimulation });
  const SECTION_GAP = 7;
  const BLOCK_GAP = 6;
  const TABLE_GAP = 8;
  const FOOTNOTE_GAP = 3;

  const checkPageBreak = (needed: number) => {
    if (y + needed > H - 28) { doc.addPage(); y = 20; return true; }
    return false;
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬ Gold-underlined section header Ã¢â€â‚¬Ã¢â€â‚¬
  const sectionTitle = (title: string) => {
    checkPageBreak(22);
    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(title, M, y);
    y += 3;
    doc.setDrawColor(C.gold[0], C.gold[1], C.gold[2]);
    doc.setLineWidth(1);
    doc.line(M, y, M + 40, y);
    y += SECTION_GAP;
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
  };

  const bullet = (text: string, color: RGB = C.teal) => {
    checkPageBreak(12);
    doc.setFillColor(color[0], color[1], color[2]);
    doc.circle(M + 3, y - 1, 1.2, 'F');
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    const lines = doc.splitTextToSize(text, W - 2 * M - 10);
    doc.text(lines, M + 8, y);
    y += lines.length * 4.5 + 2.5;
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬ FOOTER helper Ã¢â€â‚¬Ã¢â€â‚¬
  const drawFooter = (pageNum: number, totalPages: number) => {
    const fY = H - 20;
    doc.setDrawColor(C.lightGray[0], C.lightGray[1], C.lightGray[2]);
    doc.setLineWidth(0.3);
    doc.line(M, fY, W - M, fY);
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Validade comercial: ${validadeDias} dias corridos`, M, fY + 7);
    doc.text(`Pagina ${pageNum} de ${totalPages}`, W - M, fY + 7, { align: 'right' });
    if (premium?.companyContact?.phone || premium?.companyContact?.email) {
      const ct = [premium.companyContact.phone, premium.companyContact.email].filter(Boolean).join(' | ');
      doc.setFontSize(7);
      doc.text(ct, W / 2, fY + 7, { align: 'center' });
    }
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬ Compact page header for pages 2+ Ã¢â€â‚¬Ã¢â€â‚¬
  const drawCompactHeader = (sub: string): number => {
    const h2H = 28;
    doc.setFillColor(C.header[0], C.header[1], C.header[2]);
    doc.rect(0, 0, W, h2H, 'F');
    doc.setFillColor(C.gold[0], C.gold[1], C.gold[2]);
    doc.rect(0, h2H, W, 2, 'F');
    try { if (!logoSrc) throw new Error('no logo'); doc.addImage(logoSrc, detectImageFormat(logoSrc), M, 4, 16, 16); } catch {
      // Logo fallback: render text instead of blank space
      doc.setTextColor(255, 255, 255); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
      doc.text('SOLARZAP', M + 1, 13);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text(isUsina ? 'Proposta Comercial de Usina Solar' : 'Proposta Comercial de Energia Solar', M + 22, 12);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(sub, M + 22, 20);
    doc.setTextColor(245, 245, 245);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(today, W - M, 12, { align: 'right' });
    doc.setFontSize(6.8);
    doc.text(`ID: ${propNum}`, W - M, 19, { align: 'right' });
    doc.setFillColor(C.teal[0], C.teal[1], C.teal[2]);
    const bW = doc.getTextWidth(segLabel) + 10;
    doc.roundedRect(W - M - bW, h2H + 5, bW, 7, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(segLabel, W - M - bW + 5, h2H + 10);
    return h2H + 18;
  };

  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  // PAGE 1 Ã¢â‚¬â€ COVER / OVERVIEW
  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

  const headerH = 50;
  doc.setFillColor(C.header[0], C.header[1], C.header[2]);
  doc.rect(0, 0, W, headerH, 'F');
  doc.setFillColor(C.gold[0], C.gold[1], C.gold[2]);
  doc.rect(0, headerH, W, 2.4, 'F');

  try { if (!logoSrc) throw new Error('no logo'); doc.addImage(logoSrc, detectImageFormat(logoSrc), M, 6, 24, 24); } catch {
    // Logo fallback: render text instead of blank space (Sprint 3)
    doc.setFillColor(255, 255, 255); doc.roundedRect(M, 6, 24, 24, 2, 2, 'F');
    doc.setTextColor(C.header[0], C.header[1], C.header[2]); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('SOLAR', M + 3, 17); doc.text('ZAP', M + 6, 23);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(isUsina ? 'Proposta Comercial de Usina Solar' : 'Proposta Comercial de Energia Solar', M + 30, 18);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  const coverSub = `${segLabel} | ${isUsina ? 'Ideal para quem busca retorno de longo prazo e viabilidade do investimento.' : 'Ideal para quem busca economia imediata e retorno financeiro em curto prazo.'}`;
  const subLines = doc.splitTextToSize(coverSub, W - M - 30 - M);
  doc.text(subLines, M + 30, 28);

  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
  doc.text(today, W - M, 14, { align: 'right' });

  doc.setFillColor(C.teal[0], C.teal[1], C.teal[2]);
  const badgeW = doc.getTextWidth(segLabel) + 10;
  doc.roundedRect(W - M - badgeW, 34, badgeW, 8, 2, 2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
  doc.text(segLabel, W - M - badgeW + 5, 39.5);

  y = headerH + 10;

  // Ã¢â€â‚¬Ã¢â€â‚¬ DADOS DA PROPOSTA (card) Ã¢â€â‚¬Ã¢â€â‚¬
  const cardH = 34;
  doc.setFillColor(C.lightBg[0], C.lightBg[1], C.lightBg[2]);
  doc.setDrawColor(C.lightGray[0], C.lightGray[1], C.lightGray[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, W - 2 * M, cardH, 2, 2, 'FD');

  doc.setTextColor(C.header[0], C.header[1], C.header[2]);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Dados da Proposta', M + 6, y + 8);

  doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
  doc.text(`Cliente: ${data.contact.name}`, M + 6, y + 16);
  doc.text(`Contato: ${data.contact.phone || '-'} | ${data.contact.email || '-'}`, M + 6, y + 22);
  doc.text(`Cidade/UF: ${data.contact.city || '---'}`, M + 6, y + 28);

  const rightCol = W / 2 + 40;
  doc.text(`ID da proposta: ${propNum}`, rightCol, y + 10);
  doc.text(`Segmento: ${segLabel}`, rightCol, y + 16);
  doc.text(`Tipo: ${(data.tipo_cliente || 'residencial').toLowerCase()}`, rightCol, y + 22);
  doc.text(`Validade: ${validadeDias} dias`, rightCol, y + 28);

  y += cardH + TABLE_GAP;

  // Ã¢â€â‚¬Ã¢â€â‚¬ THREE METRIC CARDS Ã¢â€â‚¬Ã¢â€â‚¬
  const cardWidth = (W - 2 * M - 8) / 3;
  const metricH = 20;
  const metricsArr = [
    { label: 'INVESTIMENTO ESTIMADO', value: fmtCurrency(data.valorTotal) },
    { label: isUsina ? 'RECEITA MENSAL ESTIMADA' : 'ECONOMIA MENSAL ESTIMADA', value: fmtCurrency(econMensal) },
    { label: 'PAYBACK ESTIMADO', value: paybackYears },
  ];

  metricsArr.forEach((m, i) => {
    const cx = M + i * (cardWidth + 4);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(C.lightGray[0], C.lightGray[1], C.lightGray[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, y, cardWidth, metricH, 2, 2, 'FD');
    doc.setFillColor(C.teal[0], C.teal[1], C.teal[2]);
    doc.roundedRect(cx, y, cardWidth, 2.5, 2, 2, 'F');
    doc.rect(cx, y + 1, cardWidth, 1.5, 'F');
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setFontSize(7.4); doc.setFont('helvetica', 'normal');
    doc.text(m.label, cx + 4, y + 8);
    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(m.value, cx + 4, y + 16);
  });
  y += metricH + 10;

  // Ã¢â€â‚¬Ã¢â€â‚¬ "Quanto custa e quanto economiza" Ã¢â€â‚¬Ã¢â€â‚¬
  sectionTitle(isUsina ? 'Investimento e Retorno Financeiro' : 'Quanto custa e quanto economiza');

  if (premium?.headline && isSensibleAiText(premium.headline, 'headline')) {
    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
    const hlLines = doc.splitTextToSize(premium.headline, W - 2 * M);
    doc.text(hlLines, M, y);
    y += hlLines.length * 4.5 + 4;
  }

  const narrative = isUsina
    ? `${fmtCurrency(data.valorTotal)} de investimento estimado para gerar receita de cerca de ${fmtCurrency(econMensal)}/mes (${fmtCurrency(econAnual)}/ano), com payback aproximado de ${paybackYears}. Receita acumulada em 25 anos: ${fmtCurrency(longTermSavings)} (simulacao).`
    : `${fmtCurrency(data.valorTotal)} de investimento estimado para economizar cerca de ${fmtCurrency(econMensal)}/mes (${fmtCurrency(econAnual)}/ano), com payback aproximado de ${paybackYears}. Economia acumulada em 25 anos: ${fmtCurrency(longTermSavings)} (simulacao).`;
  doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
  doc.setFontSize(9.6); doc.setFont('helvetica', 'normal');
  const narLines = doc.splitTextToSize(narrative, W - 2 * M);
  doc.text(narLines, M, y);
  y += narLines.length * 4.5 + BLOCK_GAP;

  // Ã¢â€â‚¬Ã¢â€â‚¬ "Objetivo do Projeto" Ã¢â€â‚¬Ã¢â€â‚¬
  if (premium?.executiveSummary) {
    sectionTitle('Objetivo do Projeto');
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');

    const sumLines = doc.splitTextToSize(premium.executiveSummary, W - 2 * M);
    doc.text(sumLines, M, y);
    y += sumLines.length * 4.5 + BLOCK_GAP;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ "Beneficios principais" Ã¢â€â‚¬Ã¢â€â‚¬
  if (premium?.valuePillars && premium.valuePillars.length > 0) {
    sectionTitle('Beneficios principais');
    premium.valuePillars.forEach((p) => {
      bullet(p.charAt(0).toUpperCase() + p.slice(1), C.teal);
    });
    y += 2;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ "Por que confiar" Ã¢â€â‚¬Ã¢â€â‚¬
  const trustItems = [
    ...(premium?.proofPoints || []),
    `Garantias comerciais: modulo ${data.moduloGarantia || 25} anos, inversor ${data.inversorGarantia || 10} anos e servicos ${data.garantiaAnos} anos.`,
    'Dimensionamento alinhado ao consumo informado e as regras vigentes de geracao distribuida.',
  ];
  sectionTitle('Por que confiar');
  trustItems.slice(0, 5).forEach((pt) => {
    bullet(pt, C.teal);
  });

  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  // PAGE 2 Ã¢â‚¬â€ ANÃƒÂLISE DE ECONOMIA + GRÃƒÂFICOS
  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  doc.addPage();
  y = drawCompactHeader(isUsina ? 'Analise de Investimento e Retorno' : 'Analise de Economia e Retorno');

  // Before/After comparison table (only for non-usina)
  if (!isUsina) {
    sectionTitle('Comparativo: Sem Solar vs Com Solar');
    const baData = {
      contaAtual: contaEstimada,
      contaComSolar,
      economiaMensal: econMensal,
      econAnual,
      custo25AnosSem: contaEstimada * 12 * 25,
      custo25AnosCom: contaComSolar * 12 * 25,
    };
    const baH = drawBeforeAfterComparison(doc, M, y, W - 2 * M, baData, chartTheme, false);
    y += baH + TABLE_GAP;
  } else {
    // Usina: Revenue projection table
    sectionTitle('Projecao de Receita e Retorno');
    const retPerReal = data.valorTotal > 0 ? retornoPorReal.toFixed(1) : '-';
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Indicador', 'Valor']],
      body: [
        ['Investimento Total', fmtCurrency(data.valorTotal)],
        ['Receita Mensal Estimada', fmtCurrency(econMensal)],
        ['Receita Anual Estimada', fmtCurrency(econAnual)],
        ['Rentabilidade aplicada', `R$ ${fmtDecimal(resolvedRentabilityRate, 2, 4)} / kWh`],
        ['Receita Acumulada (5 anos)', fmtCurrency(receita5Anos)],
        ['Receita Acumulada (15 anos)', fmtCurrency(receita15Anos)],
        ['Payback Estimado', paybackYearsDetailed],
        ['Receita Acumulada (25 anos)', fmtCurrency(longTermSavings)],
        ['ROI (25 anos)', roi25],
        ['Retorno por R$ 1,00 investido', `R$ ${retPerReal}`],
        ['Retorno por kW produzido (ao ano)', retornoPorKwpAno > 0 ? `${fmtCurrency(retornoPorKwpAno)} / kWp/ano` : '-'],
        ['Retorno por kWh produzido', retornoPorKwh > 0 ? `R$ ${fmtDecimal(retornoPorKwh)} / kWh` : '-'],
      ],
      theme: 'grid',
      headStyles: { fillColor: [C.header[0], C.header[1], C.header[2]], fontSize: 8, halign: 'center' },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY + TABLE_GAP;
  }

  // Two charts side by side
  const chartRowW = (W - 2 * M - 6) / 2;
  let topChartsCardH = 64;
  let topChartsStep = 70;
  let cumulativeCardH = 60;
  let cumulativeStep = 66;
  let showProjectionSummary = true;

  if (isUsina) {
    const pageBottom = H - 28;
    const desired = topChartsStep + cumulativeStep + 8;
    const available = pageBottom - y;
    if (available < desired) {
      const scale = Math.max(0.70, Math.min(1, (available - 4) / (topChartsStep + cumulativeStep)));
      topChartsCardH = Math.max(46, Math.floor(64 * scale));
      cumulativeCardH = Math.max(42, Math.floor(60 * scale));
      topChartsStep = topChartsCardH + 6;
      cumulativeStep = cumulativeCardH + 6;
      showProjectionSummary = false;
    }
    while (y + topChartsStep + cumulativeStep + (showProjectionSummary ? 8 : 0) > pageBottom && (topChartsCardH > 44 || cumulativeCardH > 38)) {
      if (topChartsCardH > 44) topChartsCardH -= 1;
      if (cumulativeCardH > 38) cumulativeCardH -= 1;
      topChartsStep = topChartsCardH + 6;
      cumulativeStep = cumulativeCardH + 6;
      showProjectionSummary = false;
    }
  } else {
    checkPageBreak(70);
  }

  if (isUsina) {
    drawRevenueBarChart(doc, M, y, chartRowW, topChartsCardH, {
      investimento: data.valorTotal,
      receitaAnual: econAnual,
      receita5Anos,
      receita15Anos,
      receita25Anos: longTermSavings,
      paybackYears: paybackYearsNumber,
    }, chartTheme);
  } else {
    drawSavingsBarChart(doc, M, y, chartRowW, topChartsCardH, {
      contaAtual: contaEstimada,
      contaComSolar,
      economiaMensal: econMensal,
    }, chartTheme);
  }

  drawROIPieChart(doc, M + chartRowW + 6, y, chartRowW, topChartsCardH, {
    valorTotal: data.valorTotal,
    retornoLiquido: longTermSavings - data.valorTotal,
  }, chartTheme);
  y += topChartsStep;

  // Cumulative chart (full width)
  if (!isUsina) checkPageBreak(65);
  drawCumulativeSavingsChart(doc, M, y, W - 2 * M, cumulativeCardH, {
    valorTotal: data.valorTotal,
    economiaMensal: econMensal,
    paybackMeses: paybackMonths,
    cumulativeRevenueSeries: financialOutputs?.cumulativeRevenueSeries,
  }, chartTheme, isUsina);
  y += cumulativeStep;

  // Summary text
  if (showProjectionSummary && y + 20 < H - 28) {
    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    const retPerReal = data.valorTotal > 0 ? retornoPorReal.toFixed(1) : '-';
    doc.text(
      `Para cada R$ 1,00 investido, voce recupera R$ ${retPerReal} ao longo de 25 anos.`,
      W / 2, y, { align: 'center' }
    );
    y += 8;
  }

  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  // PAGE 3 Ã¢â‚¬â€ TÃƒâ€°CNICO + EQUIPAMENTOS + AMBIENTAL
  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  doc.addPage();
  y = drawCompactHeader('Dimensionamento Tecnico e Equipamentos');

  sectionTitle('Dimensionamento do Sistema');
  autoTable(doc, {
    startY: y,
    head: [['Especificacao', 'Valor']],
    body: [
      [isUsina ? 'Geracao Media Mensal' : 'Consumo Medio Mensal', `${fmtNumber(Math.round(isUsina ? avgMonthlyGenerationKwh : data.consumoMensal))} kWh/mes`],
      ['Potencia do Sistema', `${data.potenciaSistema.toFixed(2)} kWp`],
      ['Quantidade de Paineis', `${data.quantidadePaineis} modulos`],
      ['Geracao Mensal Estimada', `${fmtNumber(Math.round(avgMonthlyGenerationKwh))} kWh/mes`],
      ['Geracao Anual Estimada', `${fmtNumber(annualGenerationKwh)} kWh/ano`],
      ['Garantia dos Servicos', `${data.garantiaAnos} anos`],
    ],
    theme: 'striped',
    headStyles: { fillColor: C.header, textColor: 255, fontStyle: 'bold', fontSize: 9.5 },
    alternateRowStyles: { fillColor: C.lightBg },
    margin: { left: M, right: M },
    styles: { fontSize: 9.5, cellPadding: 4, textColor: C.bodyText },
  });
  y = (doc as any).lastAutoTable.finalY + TABLE_GAP;

  // Kit Fotovoltaico
  sectionTitle('Kit Fotovoltaico');
  const moduloNome = data.moduloNome || `Modulo Fotovoltaico ${data.moduloPotencia || 550}W`;
  const moduloMarca = data.moduloMarca || '';
  const moduloPot = data.moduloPotencia || 550;
  const moduloGar = data.moduloGarantia || 25;
  const moduloTipo = data.moduloTipo || 'Monocristalino';
  const invNome = data.inversorNome || 'Inversor On-Grid';
  const invMarca = data.inversorMarca || '';
  const invPot = data.inversorPotencia || data.potenciaSistema;
  const invTensao = data.inversorTensao || 220;
  const invGar = data.inversorGarantia || 10;
  const invQtd = data.inversorQtd || 1;
  const estrutura = data.estruturaTipo || (isUsina ? 'Solo' : 'Telhado');

  // MÃƒÂ³dulo row
  const kitBody: string[][] = [
    ['Modulo', `${moduloNome}${moduloMarca ? ` | Marca: ${moduloMarca}` : ''}\nPotencia: ${moduloPot}W | Tipo: ${moduloTipo} | Garantia: ${moduloGar} anos`, String(data.quantidadePaineis)],
    ['Inversor', `${invNome}${invMarca ? ` | Marca: ${invMarca}` : ''}\nPotencia: ${fmtNumber(invPot)} kWp | Tensao: ${invTensao}V | Garantia: ${invGar} anos`, String(invQtd)],
    ['Estrutura', estrutura, '-'],
    ['Servicos', `Projeto, instalacao e homologacao\nGarantia dos servicos: ${data.garantiaAnos} anos`, '-'],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Componente', 'Especificacao', 'Qtd.']],
    body: kitBody,
    theme: 'striped',
    headStyles: { fillColor: C.header, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: C.lightBg },
    margin: { left: M, right: M },
    styles: { fontSize: 8.5, cellPadding: 4, textColor: C.bodyText },
    columnStyles: { 0: { cellWidth: 30, fontStyle: 'bold' }, 2: { cellWidth: 18, halign: 'center' as const } },
  });
  y = (doc as any).lastAutoTable.finalY + TABLE_GAP;

  // Monthly Generation Chart
  checkPageBreak(82);
  drawMonthlyGenerationChart(doc, M, y, W - 2 * M, 76, monthlyGen, chartTheme);
  y += 82;

  // Environmental Impact Infographic
  checkPageBreak(60);
  drawEnvChart(doc, M, y, W - 2 * M, 56, envImpact, chartTheme);
  y += 62;

  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  // PAGE 4 Ã¢â‚¬â€ FINANCEIRO + FINANCIAMENTO
  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  doc.addPage();
  y = drawCompactHeader('Analise Financeira e Financiamento');

  sectionTitle('Analise Financeira Detalhada');
  autoTable(doc, {
    startY: y,
    head: [['Descricao', 'Valor']],
    body: [
      ['Investimento Total', fmtCurrency(data.valorTotal)],
      [isUsina ? 'Receita Mensal Estimada' : 'Economia Mensal Estimada', fmtCurrency(econMensal)],
      [isUsina ? 'Receita Anual Estimada' : 'Economia Anual Estimada', fmtCurrency(econAnual)],
      ['Rentabilidade aplicada', `R$ ${fmtDecimal(resolvedRentabilityRate, 2, 4)} / kWh`],
      ['Tempo de Retorno (Payback)', paybackYearsDetailed],
      [isUsina ? 'Receita em 25 anos' : 'Economia em 25 anos', fmtCurrency(longTermSavings)],
      ['ROI em 25 anos', roi25],
    ],
    theme: 'striped',
    headStyles: { fillColor: C.header, textColor: 255, fontStyle: 'bold', fontSize: 9.5 },
    alternateRowStyles: { fillColor: C.lightBg },
    margin: { left: M, right: M },
    styles: { fontSize: 9.5, cellPadding: 4, textColor: C.bodyText },
  });
  y = (doc as any).lastAutoTable.finalY + TABLE_GAP;

  // Payment and Financing conditions
  sectionTitle('Condicoes de Pagamento');
  if (paymentConditionLabels.length > 0) {
    paymentConditionLabels.forEach((label) => bullet(label, C.teal));
  } else {
    bullet('A vista (sob consulta).', C.teal);
  }
  y += FOOTNOTE_GAP;

  if (financingSelected && showFinancingSimulation && fin.financingRows.length > 0) {
    sectionTitle('Condicoes de Financiamento');

    const financingRows = (fin.financingRows || []).sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      if (a.institutionName !== b.institutionName) return a.institutionName.localeCompare(b.institutionName, 'pt-BR');
      return a.installment - b.installment;
    });

    autoTable(doc, {
      startY: y,
      head: [['Instituicao financeira', 'Valor da parcela', 'No. de parcelas', 'Prazo de carencia']],
      body: financingRows.map((row) => [
        row.isPrimary ? `${row.institutionName} (principal)` : row.institutionName,
        `A partir de ${fmtCurrency(row.installmentValue)}`,
        `${row.installment}x`,
        row.gracePeriodLabel,
      ]),
      theme: 'striped',
      headStyles: { fillColor: C.header, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: C.lightBg },
      margin: { left: M, right: M },
      styles: { fontSize: 8.8, cellPadding: 3.5, textColor: C.bodyText },
    });
    y = (doc as any).lastAutoTable.finalY + FOOTNOTE_GAP;
    doc.setTextColor(130, 130, 130);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.text('Simulacao comercial sujeita a analise de credito da instituicao financeira.', M, y + 3);
    y += BLOCK_GAP + 3;
  }

  // Value Pillars
  if (premium?.valuePillars && premium.valuePillars.length > 0) {
    checkPageBreak(30);
    sectionTitle('Beneficios do Seu Projeto');
    premium.valuePillars.forEach((p) => {
      bullet(p.charAt(0).toUpperCase() + p.slice(1), C.teal);
    });
    y += 4;
  }

  // Observations
  if (data.observacoes) {
    checkPageBreak(25);
    sectionTitle('Observacoes');
    const obs = doc.splitTextToSize(data.observacoes, W - 2 * M);
    doc.text(obs, M, y); y += obs.length * 4.5 + BLOCK_GAP;
  }

  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  // PAGE 5 Ã¢â‚¬â€ TERMOS, PRÃƒâ€œXIMOS PASSOS, CTA
  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  doc.addPage();
  y = drawCompactHeader('Condicoes, Proximos Passos e Fechamento');

  // Assumptions
  if (premium?.assumptions && premium.assumptions.length > 0) {
    sectionTitle('Premissas da Proposta');
    doc.setTextColor(100, 100, 100); doc.setFontSize(9);
    premium.assumptions.forEach((a) => {
      checkPageBreak(10);
      doc.setFillColor(150, 150, 150); doc.circle(M + 2, y - 1, 1, 'F');
      doc.setTextColor(100, 100, 100);
      const lines = doc.splitTextToSize(a, W - 2 * M - 8);
      doc.text(lines, M + 6, y); y += lines.length * 4 + 3;
    });
    y += 4;
  }

  // Terms & Conditions
  sectionTitle('Condicoes Gerais');
  doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
  termsConditions.forEach((term, i) => {
    checkPageBreak(10);
    const termText = `${i + 1}. ${term}`;
    const lines = doc.splitTextToSize(termText, W - 2 * M - 4);
    doc.text(lines, M + 2, y);
    y += lines.length * 3.8 + 2;
  });
  y += 6;

  // Next Steps Timeline
  checkPageBreak(50);
  sectionTitle('Proximos Passos');

  nextSteps.forEach((ns, i) => {
    checkPageBreak(16);
    doc.setFillColor(C.teal[0], C.teal[1], C.teal[2]);
    doc.circle(M + 5, y, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(`${i + 1}`, M + 5, y + 1.5, { align: 'center' });

    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
    doc.text(ns.step, M + 13, y + 1);

    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
    doc.text(ns.description, M + 13, y + 6);

    if (i < nextSteps.length - 1) {
      doc.setDrawColor(C.lightGray[0], C.lightGray[1], C.lightGray[2]);
      doc.setLineWidth(0.5);
      doc.line(M + 5, y + 4, M + 5, y + 12);
    }
    y += 13;
  });
  y += 6;

  // CTA Box (Sprint 3: always render with fallback if premium CTA missing)
  {
    checkPageBreak(35);
    const ctaText = premium?.nextStepCta || (isUsina
      ? `Entre em contato conosco para dar o proximo passo rumo ao retorno com sua usina solar. Estamos prontos para tirar todas as suas duvidas!`
      : `Entre em contato conosco para dar o proximo passo rumo a economia com energia solar. Estamos prontos para tirar todas as suas duvidas!`);
    const cta = doc.splitTextToSize(ctaText, W - 2 * M - 20);
    const ctaBoxH = cta.length * 5.5 + 22;
    doc.setFillColor(C.lightBg[0], C.lightBg[1], C.lightBg[2]);
    doc.setDrawColor(C.teal[0], C.teal[1], C.teal[2]);
    doc.setLineWidth(0.8);
    doc.roundedRect(M, y, W - 2 * M, ctaBoxH, 3, 3, 'FD');
    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text('Vamos comecar?', M + 8, y + 12);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
    doc.text(cta, M + 8, y + 20);
    y += ctaBoxH + BLOCK_GAP;
  }

  // Signature block
  {
    const contractorName = String(data.signatureContractorName || data.contact.name || 'CONTRATANTE');
    const contractorCnpj = String(data.signatureContractorCnpj || '').trim();
    const companyName = String(data.signatureCompanyName || 'EMPRESA');
    const companyCnpj = String(data.signatureCompanyCnpj || '').trim();
    const signatureText = 'Em razao de ambas as partes concordarem com a proposta acima especificada, declaram a aceitacao da mesma. Assim sendo dao seguimento a providencias necessarias para a execucao do projeto. E por estarem justos e de acordo assinam a presente proposta.';
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const signatureLines = doc.splitTextToSize(signatureText, W - 2 * M);
    const signatureBlockH = (signatureLines.length * 5)
      + TABLE_GAP
      + (contractorCnpj ? 19 : 15)
      + (companyCnpj ? 19 : 15);
    checkPageBreak(signatureBlockH + 2);
    const anchoredSignatureY = (H - 28) - signatureBlockH;
    if (y < anchoredSignatureY) y = anchoredSignatureY;
    doc.text(signatureLines, M, y);
    y += signatureLines.length * 5 + TABLE_GAP;


    const lineStart = M + 38;
    const lineEnd = W - M - 38;
    doc.setDrawColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setLineWidth(0.35);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.line(lineStart, y, lineEnd, y);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(11);
    doc.text(contractorName, W / 2, y + 7, { align: 'center' });
    if (contractorCnpj) {
      doc.setFontSize(9.5);
      doc.text(contractorCnpj, W / 2, y + 12, { align: 'center' });
    }
    y += contractorCnpj ? 19 : 15;

    doc.setDrawColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setLineWidth(0.35);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.line(lineStart, y, lineEnd, y);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(11);
    doc.text(companyName, W / 2, y + 7, { align: 'center' });
    if (companyCnpj) {
      doc.setFontSize(9.5);
      doc.text(companyCnpj, W / 2, y + 12, { align: 'center' });
    }
    y += companyCnpj ? 19 : 15;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ FOOTER on all pages Ã¢â€â‚¬Ã¢â€â‚¬
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    drawFooter(i, pages);
  }

  const fileName = `Proposta_${isUsina ? 'Usina' : 'Energia'}_Solar_${data.contact.name.replace(/\s+/g, '_')}_${propNum}.pdf`;
  if (data.returnBlob) return doc.output('blob');
  doc.save(fileName);
}


// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// SELLER SCRIPT PDF (internal Ã¢â‚¬â€ NOT for client)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

export function generateSellerScriptPDF(data: SellerScriptPDFData): Blob | void {
  const doc = new jsPDF();

  // Auto-sanitise text for Helvetica (no Unicode support).
  applyPdfTextSanitizers(doc);

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  let y = 0;

  const C = buildPalette(data.colorTheme, data.secondaryColorHex);
  // logoDataUrl should always be a valid data:image/... string from useProposalLogo
  const logoSrc = data.logoDataUrl || null;
  const premium = data.premiumContent;
  const propNum = data.propNum || `PROP-${Date.now().toString().slice(-8)}`;
  const validadeDias = data.validadeDias && data.validadeDias > 0 ? data.validadeDias : 15;
  const segLabel = (data.tipo_cliente || 'indefinido').charAt(0).toUpperCase() + (data.tipo_cliente || 'indefinido').slice(1);
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const econAnual = (data.financialOutputs?.annualRevenueYear1 ?? 0) > 0
    ? (data.financialOutputs?.annualRevenueYear1 || 0)
    : data.economiaAnual;
  const econMensal = (data.financialOutputs?.monthlyRevenueYear1 ?? 0) > 0
    ? (data.financialOutputs?.monthlyRevenueYear1 || 0)
    : (econAnual / 12);
  const longTermSavings = Array.isArray(data.financialOutputs?.cumulativeRevenueSeries)
    ? (data.financialOutputs?.cumulativeRevenueSeries?.[24]
      ?? data.financialOutputs?.cumulativeRevenueSeries?.[data.financialOutputs.cumulativeRevenueSeries.length - 1]
      ?? (econAnual * 25))
    : (econAnual * 25);
  const paybackMonths = (data.financialOutputs?.paybackMonths ?? 0) > 0
    ? (data.financialOutputs?.paybackMonths || 0)
    : data.paybackMeses;
  const paybackYears = fmtYears(paybackMonths);
  const roi25 = data.valorTotal > 0
    ? `${(((longTermSavings - data.valorTotal) / data.valorTotal) * 100).toFixed(1)}%`
    : '-';
  const hasLegacyFinancingData = (Number(data.taxaFinanciamento) || 0) > 0
    || (Number(data.parcela36x) || 0) > 0
    || (Number(data.parcela60x) || 0) > 0
    || (Array.isArray(data.financingConditions) && data.financingConditions.length > 0);
  const showFinancingSimulation = typeof data.showFinancingSimulation === 'boolean'
    ? data.showFinancingSimulation
    : hasLegacyFinancingData;
  const fin = resolveFinancing({
    ...data,
    showFinancingSimulation,
  });
  const paymentConditionLabels = paymentConditionLabelsFromIds(data.paymentConditions);
  const taxa = fin.taxa > 0 ? fin.taxa : (data.taxaFinanciamento && data.taxaFinanciamento > 0 ? data.taxaFinanciamento : 1.5);

  const checkPageBreak = (needed: number) => {
    if (y + needed > H - 28) { doc.addPage(); y = 20; return true; }
    return false;
  };

  const sectionTitle = (title: string) => {
    checkPageBreak(22);
    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(title, M, y);
    y += 3;
    doc.setDrawColor(C.gold[0], C.gold[1], C.gold[2]);
    doc.setLineWidth(1);
    doc.line(M, y, M + 42, y);
    y += 7;
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setFontSize(9.3); doc.setFont('helvetica', 'normal');
  };

  const sBullet = (text: string, color: RGB = C.teal) => {
    checkPageBreak(12);
    doc.setFillColor(color[0], color[1], color[2]);
    doc.circle(M + 3, y - 1, 1.2, 'F');
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    const lines = doc.splitTextToSize(text, W - 2 * M - 10);
    doc.text(lines, M + 8, y);
    y += lines.length * 4.5 + 2.5;
  };

  const drawFooterInternal = (pageNum: number, totalPages: number) => {
    const fY = H - 20;
    doc.setDrawColor(C.lightGray[0], C.lightGray[1], C.lightGray[2]);
    doc.setLineWidth(0.3);
    doc.line(M, fY, W - M, fY);
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Uso interno (vendedor) - nao compartilhar com o cliente', M, fY + 7);
    doc.text(`Pagina ${pageNum} de ${totalPages}`, W - M, fY + 7, { align: 'right' });
  };

  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  // PAGE 1
  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  const headerH = 44;
  doc.setFillColor(C.header[0], C.header[1], C.header[2]);
  doc.rect(0, 0, W, headerH, 'F');
  doc.setFillColor(C.gold[0], C.gold[1], C.gold[2]);
  doc.rect(0, headerH, W, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  // Sprint 3: Add logo to seller script header
  let logoW = 0;
  try {
    if (!logoSrc) throw new Error('no logo');
    doc.addImage(logoSrc, detectImageFormat(logoSrc), M, 5, 18, 18);
    logoW = 22;
  } catch {
    // Logo fallback: text instead of blank
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text('SOLARZAP', M + 1, 15);
    logoW = 22;
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('Roteiro do Vendedor', M + logoW, 17);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Uso interno | ${data.contact.name}`, M + logoW, 28);

  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text(`Proposta ${propNum}`, W - M, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(today, W - M, 24, { align: 'right' });

  y = headerH + 10;

  // Warning box
  const warnH = 18;
  doc.setFillColor(C.redLight[0], C.redLight[1], C.redLight[2]);
  doc.setDrawColor(C.redBorder[0], C.redBorder[1], C.redBorder[2]);
  doc.setLineWidth(0.5);
  doc.roundedRect(M, y, W - 2 * M, warnH, 2, 2, 'FD');
  doc.setTextColor(C.warningText[0], C.warningText[1], C.warningText[2]);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('NAO COMPARTILHAR COM O CLIENTE', M + 6, y + 7);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('Use este roteiro como guia simples durante a visita.', M + 6, y + 14);
  y += warnH + 8;

  // Lead summary
  sectionTitle('Resumo do lead');
  [
    `Cliente: ${data.contact.name} | Telefone: ${data.contact.phone} | Cidade/UF: ${data.contact.city || '---'}`,
    `Segmento: ${segLabel} | Tipo: ${(data.tipo_cliente || 'indefinido').toLowerCase()}`,
  ].forEach((item) => {
    doc.setFillColor(C.header[0], C.header[1], C.header[2]);
    doc.circle(M + 3, y - 1, 1.2, 'F');
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setFontSize(9.3); doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(item, W - 2 * M - 10);
    doc.text(lines, M + 8, y);
    y += lines.length * 4.5 + 3;
  });
  y += 4;

  // Key numbers table
  sectionTitle('Numeros-chave (para abrir)');
  autoTable(doc, {
    startY: y,
    head: [['Indicador', 'Valor']],
    body: [
      ['Investimento', fmtCurrency(data.valorTotal)],
      ['Economia mensal estimada', fmtCurrency(econMensal)],
      ['Economia anual estimada', fmtCurrency(econAnual)],
      ['Payback estimado', paybackYears],
      ['ROI 25 anos (estim.)', roi25],
      ['Taxa (simulacao)', `${taxa.toFixed(2)}% a.m.`],
      ['Garantia dos servicos (referencia)', `${data.garantiaAnos} anos`],
      ['Validade comercial', `${validadeDias} dias`],
    ],
    theme: 'grid',
    headStyles: { fillColor: C.header, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    bodyStyles: { textColor: C.bodyText, lineColor: [200, 200, 200], lineWidth: 0.2 },
    margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 3.5 },
    columnStyles: { 0: { cellWidth: 115 } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Visit steps
  if (premium?.visitSteps && premium.visitSteps.length > 0) {
    sectionTitle('Como conduzir a visita (passo a passo)');
    premium.visitSteps.forEach((step, i) => {
      checkPageBreak(14);
      doc.setFillColor(C.teal[0], C.teal[1], C.teal[2]);
      doc.circle(M + 3, y - 1, 1.2, 'F');
      doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
      doc.setFontSize(9.3); doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(`${i + 1}) ${step}`, W - 2 * M - 10);
      doc.text(lines, M + 8, y);
      y += lines.length * 4.5 + 3;
    });
    y += 4;
  }

  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  // PAGE 2
  // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
  doc.addPage();

  const h2H = 28;
  doc.setFillColor(C.header[0], C.header[1], C.header[2]);
  doc.rect(0, 0, W, h2H, 'F');
  doc.setFillColor(C.gold[0], C.gold[1], C.gold[2]);
  doc.rect(0, h2H, W, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12.5); doc.setFont('helvetica', 'bold');
  doc.text('Roteiro do Vendedor', M, 12);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Uso interno | ${data.contact.name}`, M, 20);

  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
  doc.text(`Proposta ${propNum}`, W - M, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(today, W - M, 20, { align: 'right' });

  y = h2H + 10;

  // BANT qualification
  if (premium?.bantQualification && premium.bantQualification.length > 0) {
    sectionTitle('Qualificacao rapida');
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setFontSize(9.3); doc.setFont('helvetica', 'normal');
    doc.text('Orcamento | Decisor | Motivo | Prazo', M, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['Item', 'Status (se ja identificado)', 'Pergunta de validacao']],
      body: premium.bantQualification.map((r) => [r.item, r.status, r.question]),
      theme: 'striped',
      headStyles: { fillColor: C.teal, textColor: 255, fontStyle: 'bold', fontSize: 8.6 },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      bodyStyles: { textColor: C.bodyText },
      margin: { left: M, right: M },
      styles: { fontSize: 8.6, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 60 } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Value Pillars
  if (premium?.valuePillars && premium.valuePillars.length > 0) {
    sectionTitle('Pilares de valor (enfatizar na apresentacao)');
    premium.valuePillars.forEach((p) => {
      checkPageBreak(10);
      sBullet(p.charAt(0).toUpperCase() + p.slice(1), C.teal);
    });
    y += 4;
  }

  // Proof Points
  if (premium?.proofPoints && premium.proofPoints.length > 0) {
    sectionTitle('Provas e diferenciais (usar como argumento)');
    premium.proofPoints.forEach((pt) => {
      checkPageBreak(12);
      sBullet(pt, [22, 163, 74] as RGB);
    });
    y += 4;
  }

  // Objection Handlers
  if (premium?.objectionHandlers && premium.objectionHandlers.length > 0) {
    sectionTitle('Respostas a objecoes (se o cliente perguntar)');
    premium.objectionHandlers.forEach((h, i) => {
      checkPageBreak(14);
      doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
      doc.setFontSize(9.3); doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(`${i + 1}. ${h}`, W - 2 * M - 8);
      doc.text(lines, M + 4, y); y += lines.length * 4.5 + 3;
    });
    y += 4;
  }

  // Financing cheat sheet
  if (fin.showFinancing && data.valorTotal > 0) {
    sectionTitle('Financiamento (dados rapidos)');
    if (paymentConditionLabels.length > 0) {
      const paymentLine = `Pagamento: ${paymentConditionLabels.join(' | ')}`;
      const lines = doc.splitTextToSize(paymentLine, W - 2 * M - 8);
      doc.text(lines, M + 4, y);
      y += lines.length * 4.5 + 2;
    }

    const quickRows = (fin.financingRows || []).sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      if (a.institutionName !== b.institutionName) return a.institutionName.localeCompare(b.institutionName, 'pt-BR');
      return a.installment - b.installment;
    });

    if (quickRows.length > 0) {
      quickRows.slice(0, 8).forEach((row) => {
        checkPageBreak(8);
        doc.text(
          `${row.institutionName}: ${row.installment}x de ${fmtCurrency(row.installmentValue)} | carencia ${row.gracePeriodLabel}`,
          M + 4,
          y,
        );
        y += 5;
      });
      if (quickRows.length > 8) {
        doc.setFont('helvetica', 'italic');
        doc.text(`+ ${quickRows.length - 8} condicoes adicionais no PDF do cliente`, M + 4, y);
        doc.setFont('helvetica', 'normal');
        y += 5;
      }
    } else {
      if (fin.taxa > 0) { doc.text(`Taxa: ${fin.taxa.toFixed(2)}% a.m.`, M + 4, y); y += 5.5; }
      if (fin.pmt36 > 0) { doc.text(`36x de ${fmtCurrency(fin.pmt36)} (total: ${fmtCurrency(fin.pmt36 * 36)})`, M + 4, y); y += 5.5; }
      if (fin.pmt60 > 0) { doc.text(`60x de ${fmtCurrency(fin.pmt60)} (total: ${fmtCurrency(fin.pmt60 * 60)})`, M + 4, y); y += 5.5; }
    }

    const bestInstallment = quickRows.find((row) => econMensal >= row.installmentValue)
      || (fin.pmt60 > 0 ? { installment: 60, installmentValue: fin.pmt60 } : null);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(C.teal[0], C.teal[1], C.teal[2]);
    if (bestInstallment) {
      doc.text(
        `${bestInstallment.installment}x (${fmtCurrency(bestInstallment.installmentValue)}) dentro da economia mensal (${fmtCurrency(econMensal)}).`,
        M + 4,
        y,
      );
    } else {
      doc.text(`Economia mensal: ${fmtCurrency(econMensal)} - compare com a parcela.`, M + 4, y);
    }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    y += 8;
  }

  // CTA
  if (premium?.nextStepCta) {
    checkPageBreak(28);
    sectionTitle('Frase de fechamento');
    const cta = doc.splitTextToSize(premium.nextStepCta, W - 2 * M - 16);
    const ctaBoxH = cta.length * 5.5 + 14;
    doc.setFillColor(C.lightBg[0], C.lightBg[1], C.lightBg[2]);
    doc.setDrawColor(C.teal[0], C.teal[1], C.teal[2]);
    doc.setLineWidth(0.8);
    doc.roundedRect(M, y, W - 2 * M, ctaBoxH, 3, 3, 'FD');
    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(cta, M + 8, y + 9);
    y += ctaBoxH + 6;
  }

  // Check-list Pos-Visita
  checkPageBreak(45);
  sectionTitle('Check-list Pos-Visita');
  [
    'Foto do telhado / area de instalacao',
    'Foto do padrao de entrada / quadro eletrico',
    'Copia da ultima conta de energia',
    'Confirmacao do decisor e contato principal',
    'Condicao de pagamento preferida (a vista / financiamento)',
    'Prazo desejado para instalacao',
    'Objecoes nao resolvidas (anotar para follow-up)',
  ].forEach((item) => {
    checkPageBreak(10);
    doc.setDrawColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setLineWidth(0.3);
    doc.rect(M + 2, y - 3, 3.5, 3.5);
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(item, M + 8, y);
    y += 6;
  });

  // Footer on all pages
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    drawFooterInternal(i, total);
  }

  const fileName = `Roteiro_Vendedor_${data.contact.name.replace(/\s+/g, '_')}_${propNum}.pdf`;
  if (data.returnBlob) return doc.output('blob');
  doc.save(fileName);
}

