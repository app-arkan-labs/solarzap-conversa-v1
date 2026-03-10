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
  deriveComplementary,
  getThemeById,
  mixToward,
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
  buildMonthlyChartSeriesFromAnnual,
  type ChartTheme,
} from '@/utils/proposalCharts';
import {
  PAYMENT_CONDITION_LABEL_BY_ID,
  type FinancingCondition,
  type PaymentConditionOptionId,
} from '@/types/proposalFinancing';
import { resolveCashDiscountSnapshot } from '@/utils/proposalCashDiscount';
import type { FinancialInputs, FinancialOutputs } from '@/types/proposalFinancial';
import { calculateProposalFinancials } from '@/utils/proposalFinancialModel';
import {
  isDegradationAllClientsEnabled,
  isOmCostModelEnabled,
  isSolarResourceApiEnabled,
  isTusdTeSimplifiedEnabled,
} from '@/config/featureFlags';
import {
  DEFAULT_ANALYSIS_YEARS,
  DEFAULT_ANNUAL_INCREASE_PCT,
  DEFAULT_MODULE_DEGRADATION_PCT,
  DEFAULT_RENTABILITY_RATE_PER_KWH,
} from '@/constants/financialDefaults';
import * as pdfShared from '@/utils/pdf/shared';

const fallbackSanitizeFileToken = (value: string): string => {
  const normalized = String(value || '').trim().replace(/\s+/g, '_');
  return normalized.replace(/[^a-zA-Z0-9_.-]/g, '');
};
const fallbackBuildProposalFileName = (
  customerName: string,
  proposalNumber: string,
  isUsina: boolean,
): string => {
  const customerToken = fallbackSanitizeFileToken(customerName) || 'cliente';
  const proposalToken = fallbackSanitizeFileToken(proposalNumber) || 'PROP-00000000';
  return `Proposta_${isUsina ? 'Usina' : 'Energia'}_Solar_${customerToken}_${proposalToken}.pdf`;
};
const fallbackBuildSellerScriptFileName = (customerName: string, proposalNumber: string): string => {
  const customerToken = fallbackSanitizeFileToken(customerName) || 'cliente';
  const proposalToken = fallbackSanitizeFileToken(proposalNumber) || 'PROP-00000000';
  return `Roteiro_Vendedor_${customerToken}_${proposalToken}.pdf`;
};
const buildProposalFileName = pdfShared.buildProposalFileName ?? fallbackBuildProposalFileName;
const buildSellerScriptFileName = pdfShared.buildSellerScriptFileName ?? fallbackBuildSellerScriptFileName;

// ---
// INTERFACES
// ---

export interface ProposalPDFData {
  contact: Contact;
  consumoMensal: number;
  contaLuzMensal?: number;
  potenciaSistema: number;
  quantidadePaineis: number;
  valorTotal: number;
  descontoAvistaValor?: number;
  valorAvistaLiquido?: number;
  investimentoBaseMetricas?: number;
  economiaAnual: number;
  paybackMeses: number;
  garantiaAnos: number;
  observacoes?: string;
  tipo_cliente?: string;
  tipoLigacao?: 'monofasico' | 'bifasico' | 'trifasico';
  rentabilityRatePerKwh?: number;
  tarifaKwh?: number;
  custoDisponibilidadeKwh?: number;
  irradiancia?: number;
  performanceRatio?: number;
  precoPorKwp?: number;
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
  annualOmCostPct?: number;
  annualOmCostFixed?: number;
  teRatePerKwh?: number;
  tusdRatePerKwh?: number;
  tusdCompensationPct?: number;
  financialInputs?: FinancialInputs;
  financialOutputs?: FinancialOutputs;
  financialModelVersion?: string;
  monthlyGenerationFactors?: number[];
  irradianceSource?: string;
  latitude?: number;
  longitude?: number;
  irradianceRefAt?: string;
  colorTheme?: ProposalColorTheme;
  returnBlob?: boolean;
  propNum?: string;
  logoDataUrl?: string | null;
  coverImageDataUrl?: string | null;
  coverImageDataUrls?: string[] | null;
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
  contaLuzMensal?: number;
  potenciaSistema: number;
  quantidadePaineis: number;
  valorTotal: number;
  descontoAvistaValor?: number;
  valorAvistaLiquido?: number;
  investimentoBaseMetricas?: number;
  economiaAnual: number;
  paybackMeses: number;
  garantiaAnos: number;
  tipo_cliente?: string;
  tipoLigacao?: 'monofasico' | 'bifasico' | 'trifasico';
  rentabilityRatePerKwh?: number;
  tarifaKwh?: number;
  custoDisponibilidadeKwh?: number;
  irradiancia?: number;
  performanceRatio?: number;
  precoPorKwp?: number;
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
  annualOmCostPct?: number;
  annualOmCostFixed?: number;
  teRatePerKwh?: number;
  tusdRatePerKwh?: number;
  tusdCompensationPct?: number;
  financialInputs?: FinancialInputs;
  financialOutputs?: FinancialOutputs;
  financialModelVersion?: string;
  monthlyGenerationFactors?: number[];
  irradianceSource?: string;
  latitude?: number;
  longitude?: number;
  irradianceRefAt?: string;
  returnBlob?: boolean;
  propNum?: string;
  colorTheme?: ProposalColorTheme;
  logoDataUrl?: string | null;
  coverImageDataUrl?: string | null;
  coverImageDataUrls?: string[] | null;
  signatureCompanyName?: string;
  signatureCompanyCnpj?: string;
  signatureContractorName?: string;
  signatureContractorCnpj?: string;
}

export interface PDFGenerationOptions {
  now?: Date;
  uuid?: string;
}

// Helpers

import { calcPMT } from '@/utils/financingCalc';

type RGB = [number, number, number];

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

//  Tarifa e custo de disponibilidade (ANEEL) 

/** Custo de disponibilidade em kWh por tipo de conexao/cliente (ANEEL REN 1.000/2021) */
function getCustoDisponibilidadeFallback(tipoCliente?: string): number {
  switch (tipoCliente?.toLowerCase()) {
    case 'residencial': return 50;   // bifasico (padrao residencial)
    case 'comercial': return 100;  // trifasico
    case 'industrial': return 100;  // trifasico
    case 'rural': return 30;   // monofasico
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
    `Garantia dos equipamentos e servicos: modulo (${params.moduloGarantia || 25} anos), inversor (${params.inversorGarantia || 25} anos) e servicos (${params.garantiaServicos || 25} anos).`,
    'A instalacao inclui projeto eletrico, instalacao mecanica e eletrica, comissionamento e solicitacao de vistoria junto a concessionaria.',
    'Prazo estimado de instalacao: 7 a 15 dias uteis apos aprovacao do projeto e disponibilidade de materiais.',
    paymentText,
    financingClause,
  ].filter(Boolean);
}

//  Theme-aware color palette 

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

//  Accent sanitisation for Helvetica (standard 14 font  no Unicode glyphs) 
/** Transliterate common Portuguese/Spanish accented chars so Helvetica can render them. */
function repairMojibake(text: string): string {
  if (!/[ÃƒÃ‚Ã¢]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8').decode(bytes);
    const badOriginal = (text.match(/[ÃƒÃ‚Ã¢]/g) || []).length;
    const badDecoded = (decoded.match(/[ÃƒÃ‚Ã¢]/g) || []).length;
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
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
    })
    .join(''); // keep printable ASCII + tab/new lines
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

//  AI text sanity check 
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

// ---
// CLIENT-FACING PROPOSAL PDF (5+ PAGES)
// ---

export function generateProposalPDFLegacy(data: ProposalPDFData, options?: PDFGenerationOptions): Blob | void {
  const now = options?.now ?? new Date();
  const uuid = options?.uuid ?? crypto.randomUUID();
  const doc = new jsPDF();
  const normalizedUuid = uuid.replace(/[^0-9a-fA-F]/g, '').padEnd(32, '0').slice(0, 32);
  if (Number.isFinite(now.getTime()) && typeof (doc as unknown as { setCreationDate?: (value: Date) => void }).setCreationDate === 'function') {
    (doc as unknown as { setCreationDate: (value: Date) => void }).setCreationDate(now);
  }
  if (typeof (doc as unknown as { setFileId?: (value: string) => void }).setFileId === 'function') {
    (doc as unknown as { setFileId: (value: string) => void }).setFileId(normalizedUuid);
  }

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
  const propNumSuffix = Number.isFinite(now.getTime())
    ? now.getTime().toString().slice(-8)
    : normalizedUuid.slice(-8).toUpperCase();
  const propNum = data.propNum || `PROP-${propNumSuffix}`;
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
    investimentoTotal: Math.max(0, Number(data.investimentoBaseMetricas ?? data.valorTotal) || 0),
    consumoMensalKwh: Math.max(0, Number(data.consumoMensal) || 0),
    contaLuzMensalReferencia: Math.max(
      0,
      Number(data.contaLuzMensal ?? data.financialInputs?.contaLuzMensalReferencia ?? 0) || 0,
    ),
    potenciaSistemaKwp: Math.max(0, Number(data.potenciaSistema) || 0),
    rentabilityRatePerKwh: resolvedRentabilityRate,
    tarifaKwh: Math.max(
      0,
      Number(data.tarifaKwh ?? data.financialInputs?.tarifaKwh ?? resolvedRentabilityRate) || 0,
    ),
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
    annualOmCostPct: Math.max(0, Number(data.annualOmCostPct ?? data.financialInputs?.annualOmCostPct ?? 0) || 0),
    annualOmCostFixed: Math.max(0, Number(data.annualOmCostFixed ?? data.financialInputs?.annualOmCostFixed ?? 0) || 0),
    teRatePerKwh: Math.max(0, Number(data.teRatePerKwh ?? data.financialInputs?.teRatePerKwh ?? resolvedRentabilityRate) || 0),
    tusdRatePerKwh: Math.max(0, Number(data.tusdRatePerKwh ?? data.financialInputs?.tusdRatePerKwh ?? 0) || 0),
    tusdCompensationPct: Math.max(
      0,
      Math.min(100, Number(data.tusdCompensationPct ?? data.financialInputs?.tusdCompensationPct ?? 0) || 0),
    ),
    analysisYears: Math.max(
      1,
      Number(data.financialInputs?.analysisYears || DEFAULT_ANALYSIS_YEARS) || DEFAULT_ANALYSIS_YEARS,
    ),
    uf: data.financialInputs?.uf || data.contact?.state,
    avgDailyIrradiance: Math.max(
      0.01,
      Number(data.financialInputs?.avgDailyIrradiance ?? data.irradiancia ?? 4.5) || 4.5,
    ),
    performanceRatio: Math.max(
      0.01,
      Number(data.financialInputs?.performanceRatio ?? data.performanceRatio ?? 0.8) || 0.8,
    ),
    daysInMonth: Math.max(
      1,
      Number(
        data.financialInputs?.daysInMonth
        ?? ((data.irradianceSource || data.financialInputs?.irradianceSource) === 'pvgis' ? 30.4375 : 30),
      ) || 30,
    ),
    monthlyGenerationFactors: data.financialInputs?.monthlyGenerationFactors || data.monthlyGenerationFactors,
    irradianceSource: (
      data.financialInputs?.irradianceSource || data.irradianceSource
    ) as FinancialInputs['irradianceSource'] | undefined,
    latitude: Number.isFinite(Number(data.financialInputs?.latitude ?? data.latitude))
      ? Number(data.financialInputs?.latitude ?? data.latitude)
      : undefined,
    longitude: Number.isFinite(Number(data.financialInputs?.longitude ?? data.longitude))
      ? Number(data.financialInputs?.longitude ?? data.longitude)
      : undefined,
  };
  const cashDiscountSnapshot = resolveCashDiscountSnapshot({
    valorTotal: data.valorTotal,
    descontoAvistaValor: data.descontoAvistaValor,
    paymentConditions: data.paymentConditions,
  });
  const descontoAvistaValor = cashDiscountSnapshot.descontoAvistaValor;
  const valorAvistaLiquido = Number.isFinite(Number(data.valorAvistaLiquido))
    ? Math.max(0, Number(data.valorAvistaLiquido) || 0)
    : cashDiscountSnapshot.valorAvistaLiquido;
  const investimentoBaseMetricas = Number.isFinite(Number(data.investimentoBaseMetricas))
    ? Math.max(0, Number(data.investimentoBaseMetricas) || 0)
    : cashDiscountSnapshot.investimentoBaseMetricas;
  const showCashDiscountBreakdown = descontoAvistaValor > 0
    || Math.abs(investimentoBaseMetricas - Math.max(0, Number(data.valorTotal) || 0)) > 0.009;
  resolvedFinancialInputs.investimentoTotal = investimentoBaseMetricas;
  const financialOutputs: FinancialOutputs = data.financialOutputs
    ? (data.financialOutputs as FinancialOutputs)
    : calculateProposalFinancials(resolvedFinancialInputs);
  const tusdTeSimplifiedEnabled = isTusdTeSimplifiedEnabled();
  const solarResourceApiEnabled = isSolarResourceApiEnabled();
  const degradationAllClientsEnabled = isDegradationAllClientsEnabled();
  const effectiveTeRate = Math.max(0, Number(resolvedFinancialInputs.teRatePerKwh) || 0);
  const effectiveTusdRate = Math.max(0, Number(resolvedFinancialInputs.tusdRatePerKwh) || 0);
  const effectiveTusdCompensationPct = Math.max(
    0,
    Math.min(100, Number(resolvedFinancialInputs.tusdCompensationPct) || 0),
  );
  const effectiveTotalRate = tusdTeSimplifiedEnabled
    ? (effectiveTeRate + (effectiveTusdRate * (effectiveTusdCompensationPct / 100)))
    : resolvedRentabilityRate;
  const econAnualRaw = (financialOutputs?.annualRevenueYear1 ?? 0) > 0
    ? (financialOutputs?.annualRevenueYear1 || 0)
    : data.economiaAnual;
  const econMensalRaw = (financialOutputs?.monthlyRevenueYear1 ?? 0) > 0
    ? (financialOutputs?.monthlyRevenueYear1 || 0)
    : (econAnualRaw / 12);
  const omCostModelEnabled = isOmCostModelEnabled();
  const econAnual = !isUsina && Number.isFinite(financialOutputs.savingsAnnual as number)
    && !omCostModelEnabled
    ? (financialOutputs.savingsAnnual as number)
    : econAnualRaw;
  const econMensal = !isUsina && Number.isFinite(financialOutputs.savingsMonthly as number)
    && !omCostModelEnabled
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
  const roi25Pct = investimentoBaseMetricas > 0
    ? (((longTermSavings - investimentoBaseMetricas) / investimentoBaseMetricas) * 100)
    : 0;
  const roi25 = investimentoBaseMetricas > 0 ? `${roi25Pct.toFixed(1)}%` : '-';
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
  const retornoPorReal = investimentoBaseMetricas > 0
    ? ((financialOutputs?.retornoPorReal ?? 0) > 0
      ? (financialOutputs?.retornoPorReal || 0)
      : (longTermSavings / investimentoBaseMetricas))
    : 0;
  const segLabel = (data.tipo_cliente || 'residencial').charAt(0).toUpperCase() + (data.tipo_cliente || 'residencial').slice(1);
  const today = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // logoDataUrl should always be a valid data:image/... string from useProposalLogo
  const logoSrc = data.logoDataUrl || null;
  const envImpact: EnvironmentalImpact = calcEnvironmentalImpact(data.consumoMensal * 12, 25);
  const fallbackMonthlyGen = calcMonthlyGeneration(
    resolvedFinancialInputs.potenciaSistemaKwp,
    resolvedFinancialInputs.consumoMensalKwh,
    {
      monthlyGenerationFactors: resolvedFinancialInputs.monthlyGenerationFactors,
      uf: resolvedFinancialInputs.uf,
      avgDailyIrradiance: resolvedFinancialInputs.avgDailyIrradiance,
      performanceRatio: resolvedFinancialInputs.performanceRatio,
      daysInMonth: resolvedFinancialInputs.daysInMonth,
    },
  );
  const annualGenerationFromModel = Number(financialOutputs?.annualGenerationKwhYear1);
  const annualGenerationKwh = Number.isFinite(annualGenerationFromModel) && annualGenerationFromModel > 0
    ? Math.max(0, annualGenerationFromModel || 0)
    : fallbackMonthlyGen.reduce((acc, value) => acc + Math.max(0, Number(value) || 0), 0);
  const annualBaseForChart = annualGenerationKwh;
  const monthlyGenChart = buildMonthlyChartSeriesFromAnnual(annualBaseForChart);
  const avgMonthlyGenerationKwh = annualGenerationKwh / 12;
  const daysInMonthAssumption = solarResourceApiEnabled ? 30.4375 : 30;
  const resolvedPerformanceRatio = Math.max(0, Number(data.performanceRatio ?? 0.8) || 0.8);
  const resolvedIrradiance = Math.max(0, Number(data.irradiancia) || 0);
  const resolvedHorizonYears = Math.max(
    1,
    Number(resolvedFinancialInputs.analysisYears ?? DEFAULT_ANALYSIS_YEARS) || DEFAULT_ANALYSIS_YEARS,
  );
  const resolvedIrradianceSource = String(
    data.irradianceSource
    || data.financialInputs?.irradianceSource
    || (solarResourceApiEnabled ? 'uf_fallback' : 'legacy_profile'),
  ).toLowerCase();
  const resolvedLat = Number(data.latitude ?? data.financialInputs?.latitude);
  const resolvedLon = Number(data.longitude ?? data.financialInputs?.longitude);
  const showExtendedAssumptions = solarResourceApiEnabled
    || omCostModelEnabled
    || degradationAllClientsEnabled
    || tusdTeSimplifiedEnabled;
  const mapIrradianceSourceLabel = (source: string): string => {
    if (source === 'pvgis') return 'PVGIS georreferenciado';
    if (source === 'pvgis_cache_degraded') return 'PVGIS cache degradado';
    if (source === 'open_meteo') return 'Open-Meteo georreferenciado';
    if (source === 'cache') return 'cache georreferenciado';
    if (source === 'uf_fallback') return 'fallback por UF';
    if (source === 'legacy_profile') return 'perfil sazonal legado';
    return source || 'nao informado';
  };
  const effectiveOmCostPct = Math.max(0, Number(resolvedFinancialInputs.annualOmCostPct) || 0);
  const effectiveOmCostFixed = Math.max(0, Number(resolvedFinancialInputs.annualOmCostFixed) || 0);
  const effectiveAnnualIncreasePct = Math.max(0, Number(resolvedFinancialInputs.annualEnergyIncreasePct) || 0);
  const effectiveModuleDegradationPct = Math.max(0, Number(resolvedFinancialInputs.moduleDegradationPct) || 0);
  const retornoPorKwpAno = (financialOutputs?.retornoPorKwpAno ?? 0) > 0
    ? (financialOutputs?.retornoPorKwpAno || 0)
    : (data.potenciaSistema > 0 ? (econAnual / data.potenciaSistema) : 0);
  const retornoPorKwh = (financialOutputs?.retornoPorKwh ?? 0) > 0
    ? (financialOutputs?.retornoPorKwh || 0)
    : (annualGenerationKwh > 0 ? (econAnual / annualGenerationKwh) : 0);
  const equipSpecs: EquipmentSpec[] = premium?.equipmentSpecs || [
    { item: 'Modulos Fotovoltaicos', spec: 'Monocristalino 550W+ Tier 1', qty: data.quantidadePaineis, warranty: '12 anos produto / 25 anos performance' },
    { item: 'Inversor', spec: 'On-Grid alta eficiencia (>97%)', qty: 1, warranty: '25 anos' },
    { item: 'Estrutura de Fixacao', spec: 'Aluminio anodizado', qty: `${data.quantidadePaineis} conjuntos`, warranty: '15 anos' },
    { item: 'Cabos e Conectores', spec: 'Solar CC 6mm\u00B2 + MC4', qty: 'Kit completo', warranty: '10 anos' },
    { item: 'String Box / Protecao', spec: 'DPS + chave seccionadora CC/CA', qty: 1, warranty: '5 anos' },
  ];
  // Monthly bill comparison for before/after chart.
  const billBeforeFromModel = Number(financialOutputs.billBeforeMonthly);
  const billAfterFromModel = Number(financialOutputs.billAfterMonthly);
  const contaLuzMensalReferencia = Math.max(
    0,
    Number(data.contaLuzMensal ?? resolvedFinancialInputs.contaLuzMensalReferencia ?? 0) || 0,
  );
  const fallbackBillBefore = data.consumoMensal * effectiveTotalRate;
  const fallbackBillAfter = Math.min(data.consumoMensal, resolvedFinancialInputs.custoDisponibilidadeKwh || 0) * effectiveTotalRate;
  const contaEstimada = !isUsina
    ? (contaLuzMensalReferencia > 0
      ? contaLuzMensalReferencia
      : (Number.isFinite(billBeforeFromModel) ? billBeforeFromModel : fallbackBillBefore))
    : 0;
  const contaComSolarRaw = !isUsina
    ? (Number.isFinite(billAfterFromModel) ? billAfterFromModel : fallbackBillAfter)
    : 0;
  const billSavingsMonthly = !isUsina
    ? (Number.isFinite(financialOutputs.savingsMonthly as number)
      ? Math.max(0, Number(financialOutputs.savingsMonthly) || 0)
      : Math.max(0, contaEstimada - contaComSolarRaw))
    : 0;
  const contaComSolar = !isUsina
    ? Math.max(0, contaEstimada - billSavingsMonthly)
    : contaComSolarRaw;
  if (!isUsina) {
    const comparableSavingsMonthly = billSavingsMonthly;
    const diff = Math.abs((contaEstimada - contaComSolar) - comparableSavingsMonthly);
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

  //  Gold-underlined section header 
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

  //  FOOTER helper 
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

  //  Compact page header for pages 2+ 
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

// ---
  // PAGE 0  COVER (clean modern layout â€” white bg, brand stripe, partial photo)
// ---
  const coverImageSrc = data.coverImageDataUrl || null;
  const coverImageList = Array.isArray(data.coverImageDataUrls)
    ? data.coverImageDataUrls.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  const coverImages = [
    ...coverImageList,
    ...(coverImageSrc ? [coverImageSrc] : []),
  ].slice(0, 3);
  const tipoClienteCover = (data.tipo_cliente || 'residencial').toLowerCase();

  const coverSubtitles: Record<string, string> = {
    residencial: 'Economia e sustentabilidade para sua casa',
    comercial: 'Reducao de custos operacionais com energia limpa',
    industrial: 'Eficiencia energetica para sua industria',
    rural: 'Energia solar no campo - economia e independencia',
    usina: 'Investimento em geracao de energia solar',
  };

  // 1. Clean white background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, 'F');

  // 2. Brand vertical stripe (left edge)
  doc.setFillColor(C.header[0], C.header[1], C.header[2]);
  doc.rect(0, 0, 4.5, H, 'F');

  // 3. Brand horizontal bar (bottom)
  doc.setFillColor(C.header[0], C.header[1], C.header[2]);
  doc.rect(0, H - 4, W, 4, 'F');

  // 4. Right-side 3-image mosaic (landscape cards, no stretching)
  const galleryX = 112;
  const coverCardW = 90;
  const coverCardH = 60; // 1.5 ratio, matches source images (1600x1067)
  const coverCardGap = 8;
  const galleryTop = (H - (coverCardH * 3 + coverCardGap * 2)) / 2;

  const drawPhotoCard = (x: number, y: number, imageSrc: string | null) => {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x - 1.2, y - 1.2, coverCardW + 2.4, coverCardH + 2.4, 1.6, 1.6, 'F');
    doc.setDrawColor(C.lightGray[0], C.lightGray[1], C.lightGray[2]);
    doc.setLineWidth(0.4);
    doc.roundedRect(x - 1.2, y - 1.2, coverCardW + 2.4, coverCardH + 2.4, 1.6, 1.6, 'S');

    if (imageSrc) {
      try {
        doc.addImage(imageSrc, detectImageFormat(imageSrc), x, y, coverCardW, coverCardH);
        return;
      } catch {
        // fall through to gradient fallback
      }
    }

    const fbSteps = 12;
    for (let s = 0; s < fbSteps; s++) {
      const t = s / Math.max(1, fbSteps - 1);
      const fc = mixToward(C.lightBg, mixToward(C.header, [0, 0, 0] as RGB, 0.18) as RGB, t * 0.5);
      doc.setFillColor(fc[0], fc[1], fc[2]);
      doc.rect(x, y + (coverCardH / fbSteps) * s, coverCardW, coverCardH / fbSteps + 0.2, 'F');
    }

    doc.setDrawColor(C.gold[0], C.gold[1], C.gold[2]);
    doc.setLineWidth(0.35);
    doc.line(x + 10, y + coverCardH - 10, x + coverCardW - 12, y + 12);
    doc.line(x + 16, y + coverCardH - 10, x + coverCardW - 6, y + 18);
  };

  drawPhotoCard(galleryX, galleryTop, coverImages[0] || null);
  drawPhotoCard(galleryX, galleryTop + coverCardH + coverCardGap, coverImages[1] || coverImages[0] || null);
  drawPhotoCard(galleryX, galleryTop + (coverCardH + coverCardGap) * 2, coverImages[2] || coverImages[0] || null);

  // 5. Thin subtle accent border on gallery inner edge
  doc.setDrawColor(C.gold[0], C.gold[1], C.gold[2]);
  doc.setLineWidth(0.6);
  doc.line(galleryX - 4, galleryTop - 2, galleryX - 4, galleryTop + coverCardH * 3 + coverCardGap * 2 + 2);

  // 6. Logo (top-left)
  const coverLogoSize = 22;
  const coverLogoX = 20;
  const coverLogoY = 28;
  try {
    if (!logoSrc) throw new Error('no logo');
    doc.addImage(logoSrc, detectImageFormat(logoSrc), coverLogoX, coverLogoY, coverLogoSize, coverLogoSize);
  } catch {
    doc.setFillColor(C.lightBg[0], C.lightBg[1], C.lightBg[2]);
    doc.roundedRect(coverLogoX, coverLogoY, coverLogoSize, coverLogoSize, 2, 2, 'F');
    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('SOLAR', coverLogoX + 2, coverLogoY + 9);
    doc.text('ZAP', coverLogoX + 4, coverLogoY + 15);
  }

  // 7. Thin gold separator below logo
  const txL = 20; // text left margin
  doc.setDrawColor(C.gold[0], C.gold[1], C.gold[2]);
  doc.setLineWidth(0.6);
  doc.line(txL, 66, txL + 35, 66);

  // 8. Title block â€” strong typographic hierarchy
  doc.setTextColor(35, 35, 35);
  doc.setFontSize(30);
  doc.setFont('helvetica', 'bold');
  doc.text('PROPOSTA', txL, 84);
  doc.text('COMERCIAL', txL, 96);

  // Thick brand-color rule under title
  doc.setDrawColor(C.header[0], C.header[1], C.header[2]);
  doc.setLineWidth(3);
  doc.line(txL, 102, txL + 55, 102);

  // Type subtitle
  doc.setTextColor(C.header[0], C.header[1], C.header[2]);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(isUsina ? 'de Usina Solar' : 'de Energia Solar', txL, 113);

  // Descriptive subtitle
  const coverSubtitle = coverSubtitles[tipoClienteCover] || coverSubtitles.residencial;
  doc.setTextColor(130, 130, 130);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'normal');
  const subtitleLines = doc.splitTextToSize(coverSubtitle, 80);
  doc.text(subtitleLines, txL, 127);

  // 9. Client info block (lower-left)
  // Thin gold separator
  doc.setDrawColor(C.gold[0], C.gold[1], C.gold[2]);
  doc.setLineWidth(0.6);
  doc.line(txL, 232, txL + 35, 232);

  doc.setTextColor(35, 35, 35);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(data.contact.name || 'Cliente', txL, 244);

  if (data.contact.city) {
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'normal');
    doc.text(data.contact.city, txL, 252);
  }

  // Segment label â€” pure typography, no badge
  doc.setTextColor(C.header[0], C.header[1], C.header[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(segLabel.toUpperCase(), txL, 263);

  // Date / proposal ID
  doc.setTextColor(160, 160, 160);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${today}  |  ${propNum}`, txL, 280);

  // --- Start PAGE 1 on a new page ---
  doc.addPage();

// ---
  // PAGE 1  COVER / OVERVIEW
// ---

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

  //  DADOS DA PROPOSTA (card) 
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

  //  THREE METRIC CARDS 
  const cardWidth = (W - 2 * M - 8) / 3;
  const metricH = 20;
  const metricsArr = [
    { label: 'INVESTIMENTO ESTIMADO', value: fmtCurrency(investimentoBaseMetricas) },
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

  //  "Quanto custa e quanto economiza" 
  sectionTitle(isUsina ? 'Investimento e Retorno Financeiro' : 'Quanto custa e quanto economiza');

  if (premium?.headline && isSensibleAiText(premium.headline, 'headline')) {
    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
    const hlLines = doc.splitTextToSize(premium.headline, W - 2 * M);
    doc.text(hlLines, M, y);
    y += hlLines.length * 4.5 + 4;
  }

  const narrative = isUsina
    ? `${fmtCurrency(investimentoBaseMetricas)} de investimento estimado para gerar receita de cerca de ${fmtCurrency(econMensal)}/mes (${fmtCurrency(econAnual)}/ano), com payback aproximado de ${paybackYears}. Receita acumulada em 25 anos: ${fmtCurrency(longTermSavings)} (simulacao).`
    : `${fmtCurrency(investimentoBaseMetricas)} de investimento estimado para economizar cerca de ${fmtCurrency(econMensal)}/mes (${fmtCurrency(econAnual)}/ano), com payback aproximado de ${paybackYears}. Economia acumulada em 25 anos: ${fmtCurrency(longTermSavings)} (simulacao).`;
  doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
  doc.setFontSize(9.6); doc.setFont('helvetica', 'normal');
  const narLines = doc.splitTextToSize(narrative, W - 2 * M);
  doc.text(narLines, M, y);
  y += narLines.length * 4.5 + BLOCK_GAP;

  //  "Objetivo do Projeto" 
  if (premium?.executiveSummary) {
    sectionTitle('Objetivo do Projeto');
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');

    const sumLines = doc.splitTextToSize(premium.executiveSummary, W - 2 * M);
    doc.text(sumLines, M, y);
    y += sumLines.length * 4.5 + BLOCK_GAP;
  }

  //  "Beneficios principais" 
  if (premium?.valuePillars && premium.valuePillars.length > 0) {
    sectionTitle('Beneficios principais');
    premium.valuePillars.forEach((p) => {
      bullet(p.charAt(0).toUpperCase() + p.slice(1), C.teal);
    });
    y += 2;
  }

  //  "Por que confiar" 
  const trustItems = [
    ...(premium?.proofPoints || []),
    `Garantias comerciais: modulo ${data.moduloGarantia || 25} anos, inversor ${data.inversorGarantia || 25} anos e servicos ${data.garantiaAnos} anos.`,
    'Dimensionamento alinhado ao consumo informado e as regras vigentes de geracao distribuida.',
  ];
  sectionTitle('Por que confiar');
  trustItems.slice(0, 5).forEach((pt) => {
    bullet(pt, C.teal);
  });

// ---
  // PAGE 2  ANLISE DE ECONOMIA + GRFICOS
// ---
  doc.addPage();
  y = drawCompactHeader(isUsina ? 'Analise de Investimento e Retorno' : 'Analise de Economia e Retorno');

  // Before/After comparison table (only for non-usina)
  if (!isUsina) {
    sectionTitle('Comparativo: Sem Solar vs Com Solar');
    const custo25AnosSem = contaEstimada * 12 * 25;
    const baData = {
      contaAtual: contaEstimada,
      contaComSolar,
      economiaMensal: billSavingsMonthly,
      econAnual,
      custo25AnosSem,
      custo25AnosCom: Math.max(0, custo25AnosSem - longTermSavings),
      economia25Anos: longTermSavings,
    };
    const baH = drawBeforeAfterComparison(doc, M, y, W - 2 * M, baData, chartTheme, false);
    y += baH + TABLE_GAP;
  } else {
    // Usina: Revenue projection table
    sectionTitle('Projecao de Receita e Retorno');
    const retPerReal = investimentoBaseMetricas > 0 ? retornoPorReal.toFixed(1) : '-';
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Indicador', 'Valor']],
      body: [
        ...(showCashDiscountBreakdown
          ? [
            ['Valor Bruto da Proposta', fmtCurrency(data.valorTotal)],
            ['Desconto a Vista', fmtCurrency(descontoAvistaValor)],
            ['Valor a Vista Liquido', fmtCurrency(valorAvistaLiquido)],
            ['Investimento Base (Metricas)', fmtCurrency(investimentoBaseMetricas)],
          ]
          : [['Investimento Total', fmtCurrency(investimentoBaseMetricas)]]),
        ['Receita Mensal Estimada', fmtCurrency(econMensal)],
        ['Receita Anual Estimada', fmtCurrency(econAnual)],
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
      investimento: investimentoBaseMetricas,
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
      economiaMensal: billSavingsMonthly,
    }, chartTheme);
  }

  drawROIPieChart(doc, M + chartRowW + 6, y, chartRowW, topChartsCardH, {
    valorTotal: investimentoBaseMetricas,
    retornoLiquido: longTermSavings - investimentoBaseMetricas,
  }, chartTheme);
  y += topChartsStep;

  // Cumulative chart (full width)
  if (!isUsina) checkPageBreak(65);
  drawCumulativeSavingsChart(doc, M, y, W - 2 * M, cumulativeCardH, {
    valorTotal: investimentoBaseMetricas,
    economiaMensal: econMensal,
    paybackMeses: paybackMonths,
    cumulativeRevenueSeries: financialOutputs?.cumulativeRevenueSeries,
  }, chartTheme, isUsina);
  y += cumulativeStep;

  // Summary text
  if (showProjectionSummary && y + 20 < H - 28) {
    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    const retPerReal = investimentoBaseMetricas > 0 ? retornoPorReal.toFixed(1) : '-';
    doc.text(
      `Para cada R$ 1,00 investido, voce recupera R$ ${retPerReal} ao longo de 25 anos.`,
      W / 2, y, { align: 'center' }
    );
    y += 8;
  }

// ---
  // PAGE 3  TCNICO + EQUIPAMENTOS + AMBIENTAL
// ---
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
  const invGar = data.inversorGarantia || 25;
  const invQtd = data.inversorQtd || 1;
  const estrutura = data.estruturaTipo || (isUsina ? 'Solo' : 'Telhado');

  // Mdulo row
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
  drawMonthlyGenerationChart(doc, M, y, W - 2 * M, 76, monthlyGenChart, chartTheme);
  y += 82;

  // Environmental Impact Infographic
  checkPageBreak(60);
  drawEnvChart(doc, M, y, W - 2 * M, 56, envImpact, chartTheme);
  y += 62;

// ---
  // PAGE 4  FINANCEIRO + FINANCIAMENTO
// ---
  doc.addPage();
  y = drawCompactHeader('Analise Financeira e Financiamento');

  sectionTitle('Analise Financeira Detalhada');
  autoTable(doc, {
    startY: y,
    head: [['Descricao', 'Valor']],
    body: [
      ...(showCashDiscountBreakdown
        ? [
          ['Valor Bruto da Proposta', fmtCurrency(data.valorTotal)],
          ['Desconto a Vista', fmtCurrency(descontoAvistaValor)],
          ['Valor a Vista Liquido', fmtCurrency(valorAvistaLiquido)],
          ['Investimento Base (Metricas)', fmtCurrency(investimentoBaseMetricas)],
        ]
        : [['Investimento Total', fmtCurrency(investimentoBaseMetricas)]]),
      [isUsina ? 'Receita Mensal Estimada' : 'Economia Mensal Estimada', fmtCurrency(econMensal)],
      [isUsina ? 'Receita Anual Estimada' : 'Economia Anual Estimada', fmtCurrency(econAnual)],
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

// ---
  // PAGE 5  TERMOS, PRXIMOS PASSOS, CTA
// ---
  doc.addPage();
  y = drawCompactHeader('Condicoes, Proximos Passos e Fechamento');

  const assumptionsFromPremium = premium?.assumptions || [];
  const assumptionsSnapshot = (financialOutputs?.assumptionsSnapshot || {}) as Record<string, unknown>;
  // Hidden in client-facing proposal by request.
  const transparencyAssumptions: string[] = [];

  // Assumptions
  if (assumptionsFromPremium.length > 0 || transparencyAssumptions.length > 0) {
    sectionTitle('Premissas da Proposta');
    doc.setTextColor(100, 100, 100); doc.setFontSize(9);
    assumptionsFromPremium.forEach((a) => {
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

  //  FOOTER on all pages (skip cover page = page 1)
  const pages = doc.getNumberOfPages();
  const contentPages = pages - 1; // cover page is page 1, content starts at page 2
  for (let i = 2; i <= pages; i++) {
    doc.setPage(i);
    drawFooter(i - 1, contentPages);
  }

  const fileName = buildProposalFileName(data.contact.name, propNum, isUsina);
  if (data.returnBlob) return doc.output('blob');
  doc.save(fileName);
}


// ---
// SELLER SCRIPT PDF (internal  NOT for client)
// ---

export function generateSellerScriptPDFLegacy(data: SellerScriptPDFData, options?: PDFGenerationOptions): Blob | void {
  const now = options?.now ?? new Date();
  const uuid = options?.uuid ?? crypto.randomUUID();
  const doc = new jsPDF();
  const normalizedUuid = uuid.replace(/[^0-9a-fA-F]/g, '').padEnd(32, '0').slice(0, 32);
  if (Number.isFinite(now.getTime()) && typeof (doc as unknown as { setCreationDate?: (value: Date) => void }).setCreationDate === 'function') {
    (doc as unknown as { setCreationDate: (value: Date) => void }).setCreationDate(now);
  }
  if (typeof (doc as unknown as { setFileId?: (value: string) => void }).setFileId === 'function') {
    (doc as unknown as { setFileId: (value: string) => void }).setFileId(normalizedUuid);
  }

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
  const propNumSuffix = Number.isFinite(now.getTime())
    ? now.getTime().toString().slice(-8)
    : normalizedUuid.slice(-8).toUpperCase();
  const propNum = data.propNum || `PROP-${propNumSuffix}`;
  const validadeDias = data.validadeDias && data.validadeDias > 0 ? data.validadeDias : 15;
  const segLabel = (data.tipo_cliente || 'indefinido').charAt(0).toUpperCase() + (data.tipo_cliente || 'indefinido').slice(1);
  const today = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
  const cashDiscountSnapshot = resolveCashDiscountSnapshot({
    valorTotal: data.valorTotal,
    descontoAvistaValor: data.descontoAvistaValor,
    paymentConditions: data.paymentConditions,
  });
  const descontoAvistaValor = cashDiscountSnapshot.descontoAvistaValor;
  const valorAvistaLiquido = Number.isFinite(Number(data.valorAvistaLiquido))
    ? Math.max(0, Number(data.valorAvistaLiquido) || 0)
    : cashDiscountSnapshot.valorAvistaLiquido;
  const investimentoBaseMetricas = Number.isFinite(Number(data.investimentoBaseMetricas))
    ? Math.max(0, Number(data.investimentoBaseMetricas) || 0)
    : cashDiscountSnapshot.investimentoBaseMetricas;
  const showCashDiscountBreakdown = descontoAvistaValor > 0
    || Math.abs(investimentoBaseMetricas - Math.max(0, Number(data.valorTotal) || 0)) > 0.009;
  const paybackMonths = (data.financialOutputs?.paybackMonths ?? 0) > 0
    ? (data.financialOutputs?.paybackMonths || 0)
    : data.paybackMeses;
  const paybackYears = fmtYears(paybackMonths);
  const roi25 = investimentoBaseMetricas > 0
    ? `${(((longTermSavings - investimentoBaseMetricas) / investimentoBaseMetricas) * 100).toFixed(1)}%`
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

// ---
  // PAGE 1
// ---
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
      ...(showCashDiscountBreakdown
        ? [
          ['Valor Bruto da Proposta', fmtCurrency(data.valorTotal)],
          ['Desconto a Vista', fmtCurrency(descontoAvistaValor)],
          ['Valor a Vista Liquido', fmtCurrency(valorAvistaLiquido)],
          ['Investimento Base (Metricas)', fmtCurrency(investimentoBaseMetricas)],
        ]
        : [['Investimento', fmtCurrency(investimentoBaseMetricas)]]),
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

// ---
  // PAGE 2
// ---
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

  const fileName = buildSellerScriptFileName(data.contact.name, propNum);
  if (data.returnBlob) return doc.output('blob');
  doc.save(fileName);
}

