import React, { useState, useCallback } from 'react';
import { Contact, ClientType } from '@/types/solarzap';
import { generateProposalPDF } from '@/utils/generateProposalPDF';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLeads } from '@/hooks/domain/useLeads';
import { useProposalTheme } from '@/hooks/useProposalTheme';
import { useProposalLogo } from '@/hooks/useProposalLogo';
import { scopeProposalVersionByIdQuery } from '@/lib/multiOrgLeadScoping';
import {
  prefetchCoverImage,
  prefetchCoverImages,
  getCoverImageDataUrl,
  getCoverImageDataUrls,
} from '@/hooks/useProposalCoverImage';
import { supabase } from '@/lib/supabase';
import { BRAZIL_STATES, getIrradianceByUF } from '@/constants/solarIrradiance';
import {
  isFinancialShadowModeEnabled,
} from '@/config/featureFlags';
import * as energyDistributors from '@/constants/energyDistributors';
import {
  DEFAULT_ANALYSIS_YEARS,
  DEFAULT_ANNUAL_INCREASE_PCT,
  DEFAULT_MODULE_DEGRADATION_PCT,
  DEFAULT_RENTABILITY_RATE,
  DEFAULT_TARIFF_FALLBACK,
  TE_PCT_OF_TARIFF,
  TUSD_PCT_OF_TARIFF,
} from '@/constants/financialDefaults';
import { calculateSolarSizing } from '@/utils/solarSizing';
import {
  buildPremiumProposalContent,
  PremiumProposalContent,
  ProposalMetrics,
  ProposalCommentContext,
  CompanyProfileContext,
  ObjectionContext,
  TestimonialContext,
} from '@/utils/proposalPersonalization';
import {
  COMMON_FINANCING_INSTITUTIONS,
  INSTALLMENT_OPTIONS,
  PAYMENT_CONDITION_LABEL_BY_ID,
  PAYMENT_CONDITION_OPTIONS,
  type FinancingCondition,
  type GracePeriodUnit,
  type PaymentConditionOptionId,
} from '@/types/proposalFinancing';
import type { FinancialInputs, FinancialOutputs } from '@/types/proposalFinancial';
import { FINANCIAL_MODEL_VERSION } from '@/types/proposalFinancial';
import { calculateProposalFinancials, resolveTariffByPriority } from '@/utils/proposalFinancialModel';
import type {
  SolarResourceDebug,
  SolarResourceErrorCode,
  SolarResourceErrorPayload,
  SolarResourceResponse,
} from '@/types/solarResource';
import * as pdfShared from '@/utils/pdf/shared';

const ENERGY_DISTRIBUTOR_OPTIONS = energyDistributors.ENERGY_DISTRIBUTOR_OPTIONS;
const inferDistributor = energyDistributors.inferDistributor;
const inferUfFromCep = energyDistributors.inferUfFromCep;
const getDefaultTariffByDistributor = energyDistributors.getDefaultTariffByDistributor;
const normalizeUf = energyDistributors.normalizeUf;
const getEnergyDistributorOptionsByUfSafe =
  energyDistributors.getEnergyDistributorOptionsByUf ??
  ((_uf?: string | null): string[] => []);
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
const fallbackNormalizePdfFileName = (value: string, fallback = 'Proposta_Energia_Solar.pdf'): string => {
  const normalized = String(value || '').trim().replace(/[<>:"/\\|?*]/g, '_');
  const withoutControls = Array.from(normalized, (char) => (char.charCodeAt(0) < 32 ? '_' : char)).join('');
  const collapsed = withoutControls.replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const base = collapsed || fallback;
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
};
const fallbackTriggerBlobDownload = (blob: Blob, rawFileName: string): void => {
  const fileName = fallbackNormalizePdfFileName(rawFileName);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
  }, 1000);
};
const buildProposalFileNameSafe = pdfShared.buildProposalFileName ?? fallbackBuildProposalFileName;
const triggerBlobDownloadSafe = pdfShared.triggerBlobDownload ?? fallbackTriggerBlobDownload;

const isPvgisBasedSource = (source: string | undefined | null): boolean =>
  source === 'pvgis' || source === 'pvgis_cache_degraded';

const normalizeSolarResourceErrorCode = (value: unknown): SolarResourceErrorCode | null => {
  switch (String(value || '').trim()) {
    case 'unauthorized':
    case 'geocode_failed':
    case 'pvgis_unavailable':
    case 'upstream_rate_limited':
    case 'upstream_timeout':
    case 'upstream_http_error':
    case 'unexpected_error':
      return String(value) as SolarResourceErrorCode;
    default:
      return null;
  }
};

type ResolveSolarResourceResult = {
  resource: SolarResourceResponse | null;
  errorCode?: SolarResourceErrorCode;
  debug?: SolarResourceDebug;
};

const deriveTariffComponents = (tariffRaw: number | null | undefined) => {
  const tariff = Math.max(0, Number(tariffRaw) || 0);
  return {
    teRatePerKwh: tariff * TE_PCT_OF_TARIFF,
    tusdRatePerKwh: tariff * TUSD_PCT_OF_TARIFF,
  };
};

export interface UseProposalFormOptions {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  onGenerate: (data: ProposalData) => Promise<{ proposalVersionId: string | null; proposal?: any } | void>;
}

export interface ProposalData {
  contactId: string;
  consumoMensal: number;
  contaLuzMensal?: number;
  potenciaSistema: number;
  quantidadePaineis: number;
  valorTotal: number;
  economiaAnual: number;
  paybackMeses: number;
  garantiaAnos: number;
  observacoes?: string;
  tipo_cliente?: ClientType;
  estado?: string;
  cidade?: string;
  endereco?: string;
  cep?: string;
  irradiancia?: number;
  concessionaria?: string;
  tipoLigacao?: 'monofasico' | 'bifasico' | 'trifasico';
  rentabilityRatePerKwh?: number;
  tarifaKwh?: number;
  custoDisponibilidadeKwh?: number;
  performanceRatio?: number;
  precoPorKwp?: number;
  abaterCustoDisponibilidadeNoDimensionamento?: boolean;
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
  financialModelVersion?: typeof FINANCIAL_MODEL_VERSION;
  monthlyGenerationFactors?: number[];
  irradianceSource?: string;
  latitude?: number;
  longitude?: number;
  irradianceRefAt?: string;
  premiumPayload?: Record<string, unknown>;
  contextEngine?: unknown;
  // Sprint 3: Pass theme/logo for seller script
  proposalThemeId?: string;
  colorTheme?: import('@/utils/proposalColorThemes').ProposalColorTheme;
  logoDataUrl?: string | null;
  logoUrl?: string | null;
  brandingSnapshot?: Record<string, unknown>;
  moduloGarantia?: number;
  signatureCompanyName?: string;
  signatureCompanyCnpj?: string;
  signatureContractorName?: string;
  signatureContractorCnpj?: string;
  posicaoTelhado?: RoofPosition;
  sombreamentoPct?: number;
}

import { calcPMT } from '@/utils/financingCalc';

export const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'residencial', label: 'Residencial' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'rural', label: 'Rural' },
  { value: 'usina', label: 'Usina Solar' },
];

// ── PMT calc — uses shared utility ──

export const RATE_SHORTCUTS = [
  { label: 'Otimista 1,30%', rate: 1.3 },
  { label: 'Padrão 1,50%', rate: 1.5 },
  { label: 'Conservador 1,90%', rate: 1.9 },
];

export type TipoLigacao = 'monofasico' | 'bifasico' | 'trifasico';

export const TIPOS_LIGACAO: { value: TipoLigacao; label: string }[] = [
  { value: 'monofasico', label: 'Monofásico (30 kWh)' },
  { value: 'bifasico', label: 'Bifásico (50 kWh)' },
  { value: 'trifasico', label: 'Trifásico (100 kWh)' },
];

export const CUSTO_DISPONIBILIDADE_POR_LIGACAO: Record<TipoLigacao, number> = {
  monofasico: 30,
  bifasico: 50,
  trifasico: 100,
};

export const DEFAULT_PAYMENT_CONDITIONS: PaymentConditionOptionId[] = ['pix_avista', 'boleto_avista'];

export const MODULE_TYPE_OPTIONS = [
  'Monocristalino',
  'Policristalino',
  'Bifacial',
  'PERC',
  'TOPCon',
  'N-Type',
];

export type RoofPosition = 'norte' | 'leste_oeste' | 'sul' | 'nao_definido';

export const ROOF_POSITION_LOSS_MAP: Record<RoofPosition, number> = {
  norte: 3,
  leste_oeste: 6,
  sul: 25,
  nao_definido: 15,
};

export const ROOF_POSITION_OPTIONS: Array<{ value: RoofPosition; label: string }> = [
  { value: 'norte', label: 'Norte' },
  { value: 'leste_oeste', label: 'Leste-Oeste' },
  { value: 'sul', label: 'Sul' },
  { value: 'nao_definido', label: 'Nao Definido' },
];

export function createDefaultFinancingCondition(): FinancingCondition {
  return {
    id: crypto.randomUUID(),
    institutionName: '',
    interestRateMonthly: 1.5,
    installments: [36, 60],
    gracePeriodValue: 0,
    gracePeriodUnit: 'dias',
  };
}

export function useProposalForm({ isOpen, onClose, contact, onGenerate }: UseProposalFormOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiContent, setAiContent] = useState<PremiumProposalContent | null>(null);
  const [aiHeadline, setAiHeadline] = useState('');
  const [rentabilityManuallyEdited, setRentabilityManuallyEdited] = useState(false);
  const [tariffManuallyEdited, setTariffManuallyEdited] = useState(false);
  const { updateLead } = useLeads();
  const { orgId } = useAuth();
  const { toast } = useToast();
  const { themeId, theme, secondaryColorHex, hydrated: themeHydrated } = useProposalTheme();
  const {
    logoUrl,
    logoDataUrl,
    initialized: logoInitialized,
    ensureLogoDataUrl,
  } = useProposalLogo();

  const [formData, setFormData] = useState({
    consumoMensal: contact?.consumption || 0,
    contaLuzMensal: Math.max(0, (contact?.consumption || 0) * (contact?.energyTariffKwh || DEFAULT_TARIFF_FALLBACK)),
    potenciaSistema: 0,
    quantidadePaineis: 0,
    valorTotal: contact?.projectValue || 0,
    economiaAnual: 0,
    paybackMeses: 0,
    garantiaAnos: 25,
    observacoes: '',
    endereco: contact?.address || '',
    cidade: contact?.city || '',
    cep: contact?.zip || '',
    signatureCompanyName: '',
    signatureCompanyCnpj: '',
    signatureContractorName: contact?.name || '',
    signatureContractorCnpj: '',
    tipo_cliente: (contact?.clientType || 'residencial') as ClientType,
    taxaFinanciamento: 1.5,
    parcela36x: 0,
    parcela60x: 0,
    paymentConditions: DEFAULT_PAYMENT_CONDITIONS as PaymentConditionOptionId[],
    financingConditions: [createDefaultFinancingCondition()] as FinancingCondition[],
    financingPrimaryInstitutionId: '' as string,
    showFinancingSimulation: false,
    validadeDias: 15,
    annualEnergyIncreasePct: DEFAULT_ANNUAL_INCREASE_PCT,
    moduleDegradationPct: DEFAULT_MODULE_DEGRADATION_PCT,
    annualOmCostPct: 1,
    annualOmCostFixed: 0,
    teRatePerKwh: deriveTariffComponents(DEFAULT_TARIFF_FALLBACK).teRatePerKwh,
    tusdRatePerKwh: deriveTariffComponents(DEFAULT_TARIFF_FALLBACK).tusdRatePerKwh,
    tusdCompensationPct: 0,
    financialInputs: undefined as FinancialInputs | undefined,
    financialOutputs: undefined as FinancialOutputs | undefined,
    financialModelVersion: FINANCIAL_MODEL_VERSION as typeof FINANCIAL_MODEL_VERSION,
    // Kit Fotovoltaico
    estado: '' as string,
    irradiancia: 4.5,
    concessionaria: '',
    tipoLigacao: 'bifasico' as TipoLigacao,
    rentabilityRatePerKwh: DEFAULT_RENTABILITY_RATE,
    tarifaKwh: DEFAULT_TARIFF_FALLBACK,
    custoDisponibilidadeKwh: 50,
    performanceRatio: 0.8,
    precoPorKwp: 4500,
    abaterCustoDisponibilidadeNoDimensionamento: false,
    posicaoTelhado: 'nao_definido' as RoofPosition,
    sombreamentoPct: ROOF_POSITION_LOSS_MAP.nao_definido,
    monthlyGenerationFactors: undefined as number[] | undefined,
    irradianceSource: undefined as string | undefined,
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    irradianceRefAt: undefined as string | undefined,
    moduloNome: '',
    moduloMarca: '',
    moduloPotencia: 550,
    moduloGarantia: 25,
    moduloTipo: 'Monocristalino',
    inversorNome: '',
    inversorMarca: '',
    inversorPotencia: 0,
    inversorTensao: 220,
    inversorGarantia: 10,
    inversorQtd: 1,
    estruturaTipo: '',
  });
  const contactRef = React.useRef(contact);
  const formDataRef = React.useRef(formData);
  const rentabilityManuallyEditedRef = React.useRef(rentabilityManuallyEdited);
  const tariffManuallyEditedRef = React.useRef(tariffManuallyEdited);

  React.useEffect(() => {
    contactRef.current = contact;
  }, [contact]);

  React.useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  React.useEffect(() => {
    rentabilityManuallyEditedRef.current = rentabilityManuallyEdited;
  }, [rentabilityManuallyEdited]);

  React.useEffect(() => {
    tariffManuallyEditedRef.current = tariffManuallyEdited;
  }, [tariffManuallyEdited]);

  // ── Storage Upload (best-effort) ──
  const uploadPdfToStorage = async (blob: Blob, leadId: string, fileName: string): Promise<{ bucket: string; path: string } | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('proposal-storage-intent', {
        body: { leadId: Number(leadId), fileName, sizeBytes: blob.size, mimeType: 'application/pdf', orgId },
      });
      if (error || !data?.uploadUrl) return null;
      const resp = await fetch(data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: blob });
      if (!resp.ok) return null;
      return { bucket: data.bucket, path: data.path };
    } catch { return null; }
  };

  // ── Share Link (best-effort) ──
  const generateShareLink = async (versionId: string): Promise<{ url: string; token: string; exp: number } | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('proposal-share-link', { body: { proposalVersionId: versionId } });
      if (error || !data?.url) return null;
      return { url: data.url, token: data.token, exp: data.exp };
    } catch { return null; }
  };

  // ── Track Download (best-effort) ──
  const trackDownloadEvent = async (versionId: string, propostaId: number, leadId: number, kind: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('proposal_delivery_events').insert({
        proposal_version_id: versionId, proposta_id: propostaId, lead_id: leadId,
        user_id: user.id, channel: 'pdf_download', event_type: 'downloaded', metadata: { kind },
      });
    } catch { /* non-blocking */ }
  };

  const parseSolarResourceErrorPayload = useCallback(async (rawError: unknown): Promise<SolarResourceErrorPayload | null> => {
    const tryParseJson = (raw: unknown): any | null => {
      if (!raw || typeof raw !== 'string') return null;
      try { return JSON.parse(raw); } catch { return null; }
    };

    const extractCode = (obj: any): SolarResourceErrorPayload | null => {
      if (!obj || typeof obj !== 'object') return null;
      const code = normalizeSolarResourceErrorCode(obj.errorCode ?? obj.error ?? obj.code);
      if (!code) return null;
      return { error: code, errorCode: code, debug: obj.debug as SolarResourceDebug | undefined };
    };

    // Strategy 1: supabase-js FunctionsHttpError — context is a Response object
    const ctx = (rawError as any)?.context;
    if (ctx && typeof ctx === 'object') {
      try {
        const resp = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
        if (typeof resp.json === 'function') {
          const payload = await resp.json();
          const result = extractCode(payload);
          if (result) return result;
        }
      } catch { /* response may be consumed or invalid */ }

      // Strategy 2: context is already a parsed object (some SDK versions)
      const directCtx = extractCode(ctx);
      if (directCtx) return directCtx;

      // Strategy 3: context is a string containing JSON
      if (typeof ctx === 'string') {
        const parsed = tryParseJson(ctx);
        const result = extractCode(parsed);
        if (result) return result;
      }
    }

    // Strategy 4: error itself carries the code (e.g. relay errors)
    const directCode = extractCode(rawError as any);
    if (directCode) return directCode;

    // Strategy 5: error.message may contain the JSON body
    const msgParsed = tryParseJson((rawError as any)?.message);
    const msgResult = extractCode(msgParsed);
    if (msgResult) return msgResult;

    // Strategy 6: error.body (some SDK versions attach parsed body)
    const bodyResult = extractCode((rawError as any)?.body);
    if (bodyResult) return bodyResult;

    console.error('[solar-resource] could not parse error payload:', rawError);
    return null;
  }, []);

  const resolveSolarResource = useCallback(async (params: {
    city?: string | null;
    uf?: string | null;
    addressLine?: string | null;
    zip?: string | null;
    lat?: number;
    lon?: number;
  }): Promise<ResolveSolarResourceResult> => {
    try {
      const geocodingApiKey = String((import.meta as any)?.env?.VITE_GOOGLE_GEOCODING_API_KEY || '').trim() || undefined;
      const { data, error } = await supabase.functions.invoke('solar-resource', {
        body: {
          city: params.city || undefined,
          uf: params.uf || undefined,
          addressLine: params.addressLine || undefined,
          zip: params.zip || undefined,
          lat: params.lat,
          lon: params.lon,
          strictPvgisOnly: true,
          geocodingApiKey,
        },
      });

      if (error) {
        const parsedError = await parseSolarResourceErrorPayload(error);
        return {
          resource: null,
          errorCode: parsedError?.errorCode ?? 'unexpected_error',
          debug: parsedError?.debug,
        };
      }

      if (!data || typeof data !== 'object') {
        return { resource: null, errorCode: 'unexpected_error' };
      }

      const payload = data as Record<string, unknown>;
      const payloadErrorCode = normalizeSolarResourceErrorCode(payload.errorCode ?? payload.error);
      if (payloadErrorCode) {
        return {
          resource: null,
          errorCode: payloadErrorCode,
          debug: payload.debug as SolarResourceDebug | undefined,
        };
      }

      const source = String(payload.source || '').toLowerCase();
      if (!isPvgisBasedSource(source)) {
        return {
          resource: null,
          errorCode: 'pvgis_unavailable',
          debug: payload.debug as SolarResourceDebug | undefined,
        };
      }

      const monthlyFactors = Array.isArray(payload.monthlyGenerationFactors)
        ? (payload.monthlyGenerationFactors as unknown[])
          .slice(0, 12)
          .map((value) => Math.max(0, Number(value) || 0))
        : [];
      const monthlyIrradiance = Array.isArray(payload.monthlyIrradianceKwhM2Day)
        ? (payload.monthlyIrradianceKwhM2Day as unknown[])
          .slice(0, 12)
          .map((value) => Math.max(0, Number(value) || 0))
        : [];

      if (monthlyFactors.length !== 12 || monthlyIrradiance.length !== 12) {
        return { resource: null, errorCode: 'unexpected_error' };
      }

      return {
        resource: {
          source: source as SolarResourceResponse['source'],
          lat: Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : null,
          lon: Number.isFinite(Number(payload.lon)) ? Number(payload.lon) : null,
          annualIrradianceKwhM2Day: Math.max(0.01, Number(payload.annualIrradianceKwhM2Day) || 4.5),
          monthlyIrradianceKwhM2Day: monthlyIrradiance,
          monthlyGenerationFactors: monthlyFactors,
          referenceYear: Number.isFinite(Number(payload.referenceYear)) ? Number(payload.referenceYear) : null,
          cached: Boolean(payload.cached),
          degraded: Boolean(payload.degraded),
          errorCode: normalizeSolarResourceErrorCode(payload.errorCode),
          debug: payload.debug as SolarResourceDebug | undefined,
        },
      };
    } catch (err) {
      const parsedError = await parseSolarResourceErrorPayload(err);
      console.warn('solar-resource strict PVGIS request failed:', err);
      return {
        resource: null,
        errorCode: parsedError?.errorCode ?? 'unexpected_error',
        debug: parsedError?.debug,
      };
    }
  }, [parseSolarResourceErrorPayload]);

  const buildFinancialSnapshot = useCallback((next: typeof formData) => {
    const currentContact = contactRef.current;
    const inferredTariff = getDefaultTariffByDistributor(next.concessionaria || '');
    const tariffResolved = resolveTariffByPriority({
      manualTariffKwh: next.tarifaKwh ?? null,
      leadTariffKwh: currentContact?.energyTariffKwh ?? null,
      inferredTariffKwh: inferredTariff,
      fallbackTariffKwh: DEFAULT_TARIFF_FALLBACK,
    });
    const derivedTariffRates = deriveTariffComponents(tariffResolved.tariffKwh);
    const rawRentabilityRatePerKwh = Number(next.rentabilityRatePerKwh);
    const rawTeRatePerKwh = Number(next.teRatePerKwh);
    const rawTusdRatePerKwh = Number(next.tusdRatePerKwh);

    const financialInputs: FinancialInputs = {
      tipoCliente: next.tipo_cliente,
      investimentoTotal: Math.max(0, Number(next.valorTotal) || 0),
      consumoMensalKwh: Math.max(0, Number(next.consumoMensal) || 0),
      potenciaSistemaKwp: Math.max(0, Number(next.potenciaSistema) || 0),
      rentabilityRatePerKwh: Math.max(
        0,
        Number.isFinite(rawRentabilityRatePerKwh) ? rawRentabilityRatePerKwh : DEFAULT_RENTABILITY_RATE,
      ),
      tarifaKwh: tariffResolved.tariffKwh,
      rentabilitySource: rentabilityManuallyEditedRef.current ? 'manual' : tariffResolved.source,
      tariffSource: tariffResolved.source,
      custoDisponibilidadeKwh: Math.max(0, Number(next.custoDisponibilidadeKwh) || 0),
      abaterCustoDisponibilidadeNoDimensionamento: Boolean(next.abaterCustoDisponibilidadeNoDimensionamento),
      annualEnergyIncreasePct: Math.max(0, Number(next.annualEnergyIncreasePct) || DEFAULT_ANNUAL_INCREASE_PCT),
      moduleDegradationPct: Math.max(0, Number(next.moduleDegradationPct) || DEFAULT_MODULE_DEGRADATION_PCT),
      annualOmCostPct: Math.max(0, Number(next.annualOmCostPct) || 0),
      annualOmCostFixed: Math.max(0, Number(next.annualOmCostFixed) || 0),
      teRatePerKwh: Math.max(
        0,
        Number.isFinite(rawTeRatePerKwh) ? rawTeRatePerKwh : derivedTariffRates.teRatePerKwh,
      ),
      tusdRatePerKwh: Math.max(
        0,
        Number.isFinite(rawTusdRatePerKwh) ? rawTusdRatePerKwh : derivedTariffRates.tusdRatePerKwh,
      ),
      tusdCompensationPct: Math.max(0, Math.min(100, Number(next.tusdCompensationPct) || 0)),
      analysisYears: DEFAULT_ANALYSIS_YEARS,
      monthlyGenerationFactors: next.monthlyGenerationFactors,
      uf: next.estado,
    };
    const financialOutputs = calculateProposalFinancials(financialInputs);
    return { financialInputs, financialOutputs };
  }, []);

  const recalculateSizing = useCallback((
    next: typeof formData,
    options?: { preserveValorTotal?: boolean },
  ) => {
    const sizing = calculateSolarSizing({
      consumoMensal: next.consumoMensal || 0,
      irradiancia: next.irradiancia || 4.5,
      moduloPotenciaW: next.moduloPotencia || 550,
      performanceRatio: next.performanceRatio || 0.8,
      precoPorKwp: next.precoPorKwp || 4500,
      custoDisponibilidadeKwh: next.custoDisponibilidadeKwh ?? 50,
      aplicarCustoDisponibilidadeNoDimensionamento: Boolean(next.abaterCustoDisponibilidadeNoDimensionamento),
      sombreamentoPct: next.sombreamentoPct ?? 0,
    });

    const manualValorTotal = Math.max(0, Number(next.valorTotal) || 0);
    const autoValorTotal = Math.max(0, Number(sizing.valorTotal) || 0);
    const nextWithSizing = {
      ...next,
      quantidadePaineis: sizing.quantidadePaineis,
      potenciaSistema: sizing.potenciaSistemaKwp,
      valorTotal: options?.preserveValorTotal ? manualValorTotal : (autoValorTotal || manualValorTotal),
    };
    const { financialInputs, financialOutputs } = buildFinancialSnapshot(nextWithSizing);

    return {
      ...nextWithSizing,
      economiaAnual: Math.max(0, Number(financialOutputs.annualRevenueYear1) || 0),
      paybackMeses: Math.max(0, Number(financialOutputs.paybackMonths) || 0),
      rentabilityRatePerKwh: financialInputs.rentabilityRatePerKwh,
      tarifaKwh: financialInputs.tarifaKwh,
      teRatePerKwh: financialInputs.teRatePerKwh,
      tusdRatePerKwh: financialInputs.tusdRatePerKwh,
      financialInputs,
      financialOutputs,
      financialModelVersion: FINANCIAL_MODEL_VERSION,
    };
  }, [buildFinancialSnapshot]);

  const patchAndRecalculate = useCallback((
    prev: typeof formData,
    patch: Partial<typeof formData>,
    options?: { preserveValorTotal?: boolean },
  ) => {
    return recalculateSizing({ ...prev, ...patch }, options);
  }, [recalculateSizing]);


  const normalizeCep = (value: string) => value.replace(/\D/g, '').slice(0, 8);

  const resolveBillTariff = (next: typeof formData) => {
    const rawTariff = Number(next.tarifaKwh);
    return Math.max(0.01, Number.isFinite(rawTariff) && rawTariff > 0 ? rawTariff : DEFAULT_TARIFF_FALLBACK);
  };

  const billToConsumptionKwh = (billValue: number, tariffKwh: number) => {
    const bill = Math.max(0, Number(billValue) || 0);
    return bill / Math.max(0.01, Number(tariffKwh) || DEFAULT_TARIFF_FALLBACK);
  };

  const buildConcessionariaPatch = useCallback((
    prev: typeof formData,
    location: { uf?: string; cidade?: string; cep?: string },
  ): Partial<typeof formData> => {
    const currentContact = contactRef.current;
    const uf = normalizeUf(location.uf || prev.estado || currentContact?.state || '') || undefined;
    const cidade = String(location.cidade || prev.cidade || currentContact?.city || '').trim() || undefined;
    const cep = normalizeCep(String(location.cep || prev.cep || currentContact?.zip || '')) || undefined;

    const inference = inferDistributor({
      distributor: prev.concessionaria || currentContact?.energyDistributor || null,
      uf: uf || null,
      city: cidade || null,
      cep: cep || null,
    });

    const patch: Partial<typeof formData> = {};
    if (inference?.distributor) {
      patch.concessionaria = inference.distributor;
    }

    const tariffFromInference = getDefaultTariffByDistributor(inference?.distributor || patch.concessionaria || prev.concessionaria || '');
    if (!tariffManuallyEditedRef.current && tariffFromInference !== null) {
      const derivedTariffRates = deriveTariffComponents(tariffFromInference);
      patch.tarifaKwh = tariffFromInference;
      patch.teRatePerKwh = derivedTariffRates.teRatePerKwh;
      patch.tusdRatePerKwh = derivedTariffRates.tusdRatePerKwh;
      if (prev.tipo_cliente !== 'usina') {
        patch.consumoMensal = billToConsumptionKwh(prev.contaLuzMensal || 0, tariffFromInference);
      }
    }

    return patch;
  }, []);

  const toFiniteOrUndefined = (value: unknown): number | undefined => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  };

  type LocationOverride = {
    cidade?: string;
    estado?: string;
    endereco?: string;
    cep?: string;
    latitude?: number;
    longitude?: number;
  };

  const resolveLocationRequestSeqRef = React.useRef(0);

  const showSolarResourceErrorToast = useCallback((errorCode?: SolarResourceErrorCode, debug?: SolarResourceDebug) => {
    if (errorCode === 'unauthorized') {
      toast({
        title: 'Sessao invalida',
        description: 'Sua sessao expirou. Faca login novamente para calcular irradiancia.',
        variant: 'destructive',
      });
      return;
    }

    if (errorCode === 'geocode_failed') {
      toast({
        title: 'Falha na geocodificacao',
        description: 'Nao foi possivel converter a localizacao em coordenadas validas.',
        variant: 'destructive',
      });
      return;
    }

    if (
      errorCode === 'pvgis_unavailable'
      || errorCode === 'upstream_rate_limited'
      || errorCode === 'upstream_timeout'
      || errorCode === 'upstream_http_error'
    ) {
      const statusHint = Number.isFinite(Number(debug?.upstreamStatus))
        ? ` (HTTP ${Number(debug?.upstreamStatus)})`
        : '';
      toast({
        title: 'PVGIS indisponivel',
        description: `PVGIS indisponivel no momento${statusHint}. Tente novamente em alguns segundos.`,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Falha ao buscar dados solares',
      description: 'Tente novamente em alguns segundos.',
      variant: 'destructive',
    });
  }, [toast]);

  const resolvePreciseLocation = useCallback(async (override?: LocationOverride) => {
    const currentFormData = formDataRef.current;
    const currentContact = contactRef.current;
    const requestSeq = ++resolveLocationRequestSeqRef.current;
    const uf = String(
      override?.estado
      || currentFormData.estado
      || normalizeUf(currentContact?.state)
      || inferUfFromCep(override?.cep || currentFormData.cep || currentContact?.zip)
      || '',
    ).toUpperCase();
    const cidade = String(override?.cidade || currentFormData.cidade || currentContact?.city || '').trim();
    const endereco = String(override?.endereco || currentFormData.endereco || currentContact?.address || '').trim();
    const cep = normalizeCep(String(override?.cep || currentFormData.cep || currentContact?.zip || ''));
    const hasTextualLocation = Boolean(cidade || endereco || cep);
    const overrideLatitude = toFiniteOrUndefined(override?.latitude);
    const overrideLongitude = toFiniteOrUndefined(override?.longitude);
    const hasOverrideCoordinates = overrideLatitude !== undefined && overrideLongitude !== undefined;
    const currentLatitude = toFiniteOrUndefined(currentFormData.latitude ?? currentContact?.latitude);
    const currentLongitude = toFiniteOrUndefined(currentFormData.longitude ?? currentContact?.longitude);

    // Force fresh geocoding from textual location when available.
    const latitude = hasOverrideCoordinates
      ? overrideLatitude
      : (!hasTextualLocation ? currentLatitude : undefined);
    const longitude = hasOverrideCoordinates
      ? overrideLongitude
      : (!hasTextualLocation ? currentLongitude : undefined);

    setLocationLoading(true);
    try {
      const { resource: solarResource, errorCode, debug } = await resolveSolarResource({
        city: cidade || undefined,
        uf: uf || undefined,
        addressLine: endereco || undefined,
        zip: cep || undefined,
        lat: latitude,
        lon: longitude,
      });
      if (!solarResource) {
        if (requestSeq === resolveLocationRequestSeqRef.current) {
          showSolarResourceErrorToast(errorCode, debug);
        }
        return null;
      }
      if (requestSeq !== resolveLocationRequestSeqRef.current) {
        return null;
      }

      setFormData((prev) => patchAndRecalculate(prev, {
        estado: uf || prev.estado,
        cidade: cidade || prev.cidade,
        endereco: endereco || prev.endereco,
        cep: cep || prev.cep,
        irradiancia: solarResource.annualIrradianceKwhM2Day,
        monthlyGenerationFactors: solarResource.monthlyGenerationFactors,
        irradianceSource: solarResource.source,
        latitude: solarResource.lat ?? latitude ?? prev.latitude,
        longitude: solarResource.lon ?? longitude ?? prev.longitude,
        irradianceRefAt: new Date().toISOString(),
        ...buildConcessionariaPatch(prev, {
          uf: uf || prev.estado,
          cidade: cidade || prev.cidade,
          cep: cep || prev.cep,
        }),
      }, { preserveValorTotal: true }));

      return solarResource;
    } catch (error) {
      console.error('resolvePreciseLocation error:', error);
      if (requestSeq === resolveLocationRequestSeqRef.current) {
        showSolarResourceErrorToast('unexpected_error');
      }
      return null;
    } finally {
      if (requestSeq === resolveLocationRequestSeqRef.current) {
        setLocationLoading(false);
      }
    }
  }, [buildConcessionariaPatch, patchAndRecalculate, resolveSolarResource, showSolarResourceErrorToast]);

  const autofillAddressByCep = useCallback(async (rawCep?: string) => {
    const currentFormData = formDataRef.current;
    const cep = normalizeCep(rawCep || currentFormData.cep || '');
    if (cep.length !== 8) {
      toast({
        title: 'CEP invalido',
        description: 'Informe um CEP com 8 digitos.',
        variant: 'destructive',
      });
      return null;
    }

    setLocationLoading(true);
    try {
      let uf = '';
      let cidade = '';
      let endereco = '';
      let latitude: number | undefined;
      let longitude: number | undefined;

      try {
        const brApiResponse = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
        if (brApiResponse.ok) {
          const brApiData = await brApiResponse.json();
          uf = normalizeUf(String(brApiData?.state || brApiData?.uf || '')) || uf;
          cidade = String(brApiData?.city || brApiData?.locality || '').trim() || cidade;
          const logradouro = String(brApiData?.street || brApiData?.logradouro || '').trim();
          const bairro = String(brApiData?.neighborhood || brApiData?.bairro || '').trim();
          endereco = [logradouro, bairro].filter(Boolean).join(', ');

          latitude = toFiniteOrUndefined(brApiData?.location?.coordinates?.latitude);
          longitude = toFiniteOrUndefined(brApiData?.location?.coordinates?.longitude);
        }
      } catch (error) {
        console.warn('brasilapi CEP lookup failed:', error);
      }

      if (!uf || !cidade) {
        const viaCepResponse = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (!viaCepResponse.ok) throw new Error(`viacep_${viaCepResponse.status}`);
        const viaCepData = await viaCepResponse.json();
        if (viaCepData?.erro) throw new Error('cep_not_found');

        uf = normalizeUf(String(viaCepData.uf || '')) || uf;
        cidade = String(viaCepData.localidade || cidade || '').trim();
        const logradouro = String(viaCepData.logradouro || '').trim();
        const bairro = String(viaCepData.bairro || '').trim();
        if (!endereco) {
          endereco = [logradouro, bairro].filter(Boolean).join(', ');
        }
      }

      const nextOverride: LocationOverride = {
        cep,
        estado: uf || currentFormData.estado || undefined,
        cidade: cidade || currentFormData.cidade || undefined,
        endereco: endereco || currentFormData.endereco || undefined,
        latitude: undefined,
        longitude: undefined,
      };

      setFormData((prev) => patchAndRecalculate(prev, {
        cep,
        estado: nextOverride.estado || prev.estado,
        cidade: nextOverride.cidade || prev.cidade,
        endereco: nextOverride.endereco || prev.endereco,
        latitude: undefined,
        longitude: undefined,
        irradianceSource: undefined,
        irradianceRefAt: undefined,
        ...buildConcessionariaPatch(prev, {
          uf: nextOverride.estado || prev.estado,
          cidade: nextOverride.cidade || prev.cidade,
          cep,
        }),
      }, { preserveValorTotal: true }));

      return nextOverride;
    } catch (error) {
      console.error('autofillAddressByCep error:', error);
      toast({
        title: 'Falha ao buscar CEP',
        description: 'Nao foi possivel localizar o CEP informado em nenhum provedor.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLocationLoading(false);
    }
  }, [patchAndRecalculate, toast]);

  // ── Auto-calculate system for ALL types using Kit equipment data ──


  const calculateSystem = useCallback((consumoInput: number) => {
    setFormData((prev) => {
      if (prev.tipo_cliente === 'usina') {
        return patchAndRecalculate(prev, {
          consumoMensal: Math.max(0, Number(consumoInput) || 0),
          contaLuzMensal: undefined,
        });
      }

      const contaLuzMensal = Math.max(0, Number(consumoInput) || 0);
      const consumoMensal = billToConsumptionKwh(contaLuzMensal, resolveBillTariff(prev));
      return patchAndRecalculate(prev, {
        contaLuzMensal,
        consumoMensal,
      });
    });
  }, [patchAndRecalculate]);

  const handleChange = (field: keyof typeof formData, value: number | string | boolean) => {
    if (field === 'consumoMensal') {
      calculateSystem(value as number);
      return;
    }

    if (field === 'tipo_cliente') {
      const nextTipo = value as ClientType;
      // Pre-fetch cover gallery for the selected segment
      void prefetchCoverImages(nextTipo, 3);
      setFormData(prev => {
        const patch: Partial<typeof formData> = {
          tipo_cliente: nextTipo,
        };
        if (nextTipo === 'usina') {
          patch.contaLuzMensal = undefined;
        } else {
          const tarifa = resolveBillTariff(prev);
          patch.contaLuzMensal = Math.max(0, Number(prev.consumoMensal) || 0) * tarifa;
        }
        return patchAndRecalculate(prev, patch);
      });
      return;
    }

    if (
      field === 'moduloPotencia'
      || field === 'irradiancia'
      || field === 'custoDisponibilidadeKwh'
      || field === 'performanceRatio'
      || field === 'precoPorKwp'
      || field === 'annualEnergyIncreasePct'
      || field === 'moduleDegradationPct'
      || field === 'annualOmCostPct'
      || field === 'annualOmCostFixed'
      || field === 'teRatePerKwh'
      || field === 'tusdRatePerKwh'
      || field === 'tusdCompensationPct'
      || field === 'abaterCustoDisponibilidadeNoDimensionamento'
    ) {
      setFormData(prev => patchAndRecalculate(prev, { [field]: value } as Partial<typeof formData>));
      return;
    }

    if (field === 'rentabilityRatePerKwh') {
      const rate = Math.max(0, Number(value) || 0);
      rentabilityManuallyEditedRef.current = true;
      setRentabilityManuallyEdited(true);
      setFormData(prev => patchAndRecalculate(prev, {
        rentabilityRatePerKwh: rate,
      }));
      return;
    }

    if (field === 'valorTotal') {
      const manualValor = Math.max(0, Number(value) || 0);
      setFormData(prev => patchAndRecalculate(
        prev,
        { valorTotal: manualValor },
        { preserveValorTotal: true },
      ));
      return;
    }

    if (field === 'tarifaKwh') {
      const rate = Math.max(0, Number(value) || 0);
      const derivedTariffRates = deriveTariffComponents(rate);
      tariffManuallyEditedRef.current = true;
      setTariffManuallyEdited(true);
      setFormData(prev => {
        const patch: Partial<typeof formData> = {
          tarifaKwh: rate,
          teRatePerKwh: derivedTariffRates.teRatePerKwh,
          tusdRatePerKwh: derivedTariffRates.tusdRatePerKwh,
        };
        if (prev.tipo_cliente !== 'usina') {
          patch.consumoMensal = billToConsumptionKwh(prev.contaLuzMensal || 0, Math.max(0.01, rate || DEFAULT_TARIFF_FALLBACK));
        }
        return patchAndRecalculate(prev, patch);
      });
      return;
    }

    if (field === 'estado') {
      const uf = value as string;
      const irradianceRefAt = new Date().toISOString();
      setFormData(prev => {
        const patch: Partial<typeof formData> = {
          estado: uf,
          irradiancia: prev.irradiancia,
          irradianceSource: prev.irradianceSource,
          irradianceRefAt: prev.irradianceRefAt || irradianceRefAt,
        };
        const inference = inferDistributor({
          uf,
          city: prev.cidade || contact?.city || null,
          cep: prev.cep || contact?.zip || null,
        });
        if (!prev.concessionaria && inference?.distributor) {
          patch.concessionaria = inference.distributor;
        }
        const tariffFromInference = getDefaultTariffByDistributor(inference?.distributor || patch.concessionaria || '');
        if (!tariffManuallyEditedRef.current && tariffFromInference !== null) {
          const derivedTariffRates = deriveTariffComponents(tariffFromInference);
          patch.tarifaKwh = tariffFromInference;
          patch.teRatePerKwh = derivedTariffRates.teRatePerKwh;
          patch.tusdRatePerKwh = derivedTariffRates.tusdRatePerKwh;
          if (prev.tipo_cliente !== 'usina') {
            patch.consumoMensal = billToConsumptionKwh(prev.contaLuzMensal || 0, tariffFromInference);
          }
        }
        return patchAndRecalculate(prev, patch);
      });

      void (async () => {
        await resolvePreciseLocation({
          estado: uf,
          cidade: formData.cidade || contact?.city || undefined,
          endereco: formData.endereco || contact?.address || undefined,
          cep: formData.cep || contact?.zip || undefined,
        });
      })();
      return;
    }

    if (field === 'concessionaria') {
      const concessionaria = String(value || '');
      setFormData(prev => {
        const patch: Partial<typeof formData> = { concessionaria };
        const inferredTariff = getDefaultTariffByDistributor(concessionaria);
        if (!tariffManuallyEditedRef.current && inferredTariff !== null) {
          const derivedTariffRates = deriveTariffComponents(inferredTariff);
          patch.tarifaKwh = inferredTariff;
          patch.teRatePerKwh = derivedTariffRates.teRatePerKwh;
          patch.tusdRatePerKwh = derivedTariffRates.tusdRatePerKwh;
          if (prev.tipo_cliente !== 'usina') {
            patch.consumoMensal = billToConsumptionKwh(prev.contaLuzMensal || 0, inferredTariff);
          }
        }
        return patchAndRecalculate(prev, patch);
      });
      return;
    }

    if (field === 'tipoLigacao') {
      const tipo = value as TipoLigacao;
      setFormData(prev => patchAndRecalculate(prev, {
        tipoLigacao: tipo,
        custoDisponibilidadeKwh: CUSTO_DISPONIBILIDADE_POR_LIGACAO[tipo],
      }));
      return;
    }

    if (field === 'posicaoTelhado') {
      const posicaoTelhado = value as RoofPosition;
      setFormData(prev => patchAndRecalculate(prev, {
        posicaoTelhado,
        sombreamentoPct: ROOF_POSITION_LOSS_MAP[posicaoTelhado],
      }));
      return;
    }

    if (field === 'sombreamentoPct') {
      const sombreamentoPct = Math.max(0, Math.min(99, Number(value) || 0));
      setFormData(prev => patchAndRecalculate(prev, { sombreamentoPct }));
      return;
    }

    if (field === 'cep') {
      setFormData((prev) => ({
        ...prev,
        cep: normalizeCep(String(value || '')),
        latitude: undefined,
        longitude: undefined,
        irradianceSource: undefined,
        irradianceRefAt: undefined,
      }));
      return;
    }

    if (field === 'latitude' || field === 'longitude') {
      const parsed = Number(value);
      setFormData((prev) => ({ ...prev, [field]: Number.isFinite(parsed) ? parsed : undefined }));
      return;
    }

    if (field === 'potenciaSistema' || field === 'quantidadePaineis') {
      setFormData(prev => {
        const next = { ...prev, [field]: value } as typeof formData;
        const { financialInputs, financialOutputs } = buildFinancialSnapshot(next);
        return {
          ...next,
          economiaAnual: Math.max(0, Number(financialOutputs.annualRevenueYear1) || 0),
          paybackMeses: Math.max(0, Number(financialOutputs.paybackMonths) || 0),
          financialInputs,
          financialOutputs,
          financialModelVersion: FINANCIAL_MODEL_VERSION,
        };
      });
      return;
    }

    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const togglePaymentCondition = (id: PaymentConditionOptionId) => {
    setFormData(prev => {
      const exists = prev.paymentConditions.includes(id);
      const next = exists
        ? prev.paymentConditions.filter((value) => value !== id)
        : [...prev.paymentConditions, id];
      const financingStillSelected = next.includes('financiamento_bancario');
      return {
        ...prev,
        paymentConditions: next,
        showFinancingSimulation: financingStillSelected ? prev.showFinancingSimulation : false,
      };
    });
  };

  const setPrimaryFinancingInstitution = (id: string) => {
    setFormData(prev => ({ ...prev, financingPrimaryInstitutionId: id }));
  };

  const addFinancingCondition = () => {
    setFormData(prev => {
      const next = [...prev.financingConditions, createDefaultFinancingCondition()];
      return {
        ...prev,
        financingConditions: next,
        financingPrimaryInstitutionId: prev.financingPrimaryInstitutionId || next[0]?.id || '',
      };
    });
  };

  const removeFinancingCondition = (id: string) => {
    setFormData(prev => {
      const next = prev.financingConditions.filter((item) => item.id !== id);
      return {
        ...prev,
        financingConditions: next.length > 0 ? next : [createDefaultFinancingCondition()],
        financingPrimaryInstitutionId: prev.financingPrimaryInstitutionId === id ? (next[0]?.id || '') : prev.financingPrimaryInstitutionId,
      };
    });
  };

  const updateFinancingCondition = <K extends keyof FinancingCondition>(
    id: string,
    key: K,
    value: FinancingCondition[K],
  ) => {
    setFormData(prev => ({
      ...prev,
      financingConditions: prev.financingConditions.map((item) => (
        item.id === id ? { ...item, [key]: value } : item
      )),
    }));
  };

  const toggleInstallment = (id: string, installment: number) => {
    setFormData(prev => ({
      ...prev,
      financingConditions: prev.financingConditions.map((item) => {
        if (item.id !== id) return item;
        const current = Array.isArray(item.installments) ? item.installments : [];
        const exists = current.includes(installment);
        const next = exists
          ? current.filter((value) => value !== installment)
          : [...current, installment];
        return { ...item, installments: next.sort((a, b) => a - b) };
      }),
    }));
  };

  const applyRateShortcut = (rate: number) => {
    const primaryId = formData.financingPrimaryInstitutionId || formData.financingConditions[0]?.id;
    if (!primaryId) return;
    updateFinancingCondition(primaryId, 'interestRateMonthly', rate);
  };

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  // ── Fetch context (shared between AI and generation) ──
  const fetchContext = async (): Promise<Record<string, unknown> | null> => {
    if (!contact) return null;
    try {
      const { data, error } = await supabase.functions.invoke('proposal-context-engine', {
        body: { leadId: Number(contact.id), limitInteractions: 18, limitComments: 8, limitDocuments: 4, orgId },
      });
      if (!error && data) return data;
    } catch { /* fallback */ }
    return null;
  };

  // ── Build heuristic content ──
  const buildHeuristic = (contextData: Record<string, unknown> | null): PremiumProposalContent => {
    const metrics: ProposalMetrics = {
      consumoMensal: formData.consumoMensal, potenciaSistema: formData.potenciaSistema,
      quantidadePaineis: formData.quantidadePaineis, valorTotal: formData.valorTotal,
      economiaAnual: formData.economiaAnual, paybackMeses: formData.paybackMeses, garantiaAnos: formData.garantiaAnos,
    };
    return buildPremiumProposalContent({
      contact: contact!, clientType: formData.tipo_cliente, observacoes: formData.observacoes, metrics,
      comments: (contextData?.comments as ProposalCommentContext[]) || [],
      companyProfile: (contextData?.companyProfile as CompanyProfileContext) || null,
      objections: (contextData?.objections as ObjectionContext[]) || [],
      testimonials: (contextData?.testimonials as TestimonialContext[]) || [],
      paymentConditions: formData.paymentConditions,
      financingConditions: formData.showFinancingSimulation ? formData.financingConditions : [],
    });
  };

  // ══════════ AI PERSONALIZATION ══════════
  const handleAiPersonalize = async () => {
    if (!contact) return;
    setAiLoading(true);
    try {
      // 1) Fetch context
      const contextData = await fetchContext();

      // 2) Call proposal-composer edge function
      const { data, error } = await supabase.functions.invoke('proposal-composer', {
        body: {
          leadId: Number(contact.id),
          contactName: contact.name,
          clientType: formData.tipo_cliente,
          city: formData.cidade || contact.city || undefined,
          observacoes: formData.observacoes || undefined,
          metrics: {
            consumoMensal: formData.consumoMensal, potenciaSistema: formData.potenciaSistema,
            quantidadePaineis: formData.quantidadePaineis, valorTotal: formData.valorTotal,
            economiaAnual: formData.economiaAnual, paybackMeses: formData.paybackMeses,
            garantiaAnos: formData.garantiaAnos,
          },
          context: contextData ? {
            comments: contextData.comments || [],
            interactions: contextData.interactions || [],
            companyProfile: contextData.companyProfile || null,
            objections: contextData.objections || [],
            testimonials: contextData.testimonials || [],
            documents: [...(contextData.documents as any[] || []), ...(contextData.documentsRelevant as any[] || [])],
          } : undefined,
        },
      });

      if (error) throw error;
      if (!data?.variants?.length) throw new Error('No variants returned');

      // Use recommended variant
      const rec = data.recommendedVariant === 'b' ? 1 : 0;
      const variant = data.variants[rec] || data.variants[0];

      const content: PremiumProposalContent = {
        segment: variant.persona_focus || formData.tipo_cliente,
        segmentLabel: variant.label || formData.tipo_cliente,
        headline: variant.headline || '',
        executiveSummary: variant.executive_summary || '',
        personaFocus: variant.persona_focus || formData.tipo_cliente,
        valuePillars: variant.value_pillars || [],
        proofPoints: variant.proof_points || [],
        objectionHandlers: variant.objection_handlers || [],
        nextStepCta: variant.next_step_cta || '',
        assumptions: variant.assumptions || [],
        visitSteps: variant.visit_steps || [],
        bantQualification: variant.bant_qualification || [],
        termsConditions: variant.terms_conditions || [],
        nextStepsDetailed: variant.next_steps_detailed || [],
        persuasionScore: variant.persuasion_score || 0,
        scoreBreakdown: variant.score_breakdown || {},
        variantId: variant.id || 'ai-a',
        generatedBy: 'ai' as const,
        generatedAt: new Date().toISOString(),
      };

      setAiContent(content);
      setAiHeadline(content.headline);
      toast({ title: '✨ IA aplicada', description: 'Proposta personalizada com base no contexto do cliente.' });
    } catch (err) {
      console.error('AI personalização falhou, usando heurística:', err);
      // Fallback to heuristic
      const contextData = await fetchContext();
      const heuristic = buildHeuristic(contextData);
      setAiContent(heuristic);
      setAiHeadline(heuristic.headline);
      toast({ title: 'Personalização aplicada', description: 'Heurística local utilizada (IA indisponível).' });
    } finally {
      setAiLoading(false);
    }
  };

  // ══════════ SINGLE GENERATION FLOW ══════════
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;

    if (!isPvgisBasedSource(formData.irradianceSource) || !Number.isFinite(Number(formData.latitude)) || !Number.isFinite(Number(formData.longitude))) {
      toast({
        title: 'Irradiancia obrigatoria via PVGIS',
        description: 'Calcule o local exato ate obter fonte PVGIS antes de gerar a proposta.',
        variant: 'destructive',
      });
      return;
    }

    // Sprint 10: block generation when critical numeric values are zero/negative
    if (formData.consumoMensal <= 0 || formData.potenciaSistema <= 0 || formData.quantidadePaineis <= 0 || formData.valorTotal <= 0) {
      toast({ title: 'Dados incompletos', description: formData.tipo_cliente === 'usina' ? 'Geração estimada, potência, módulos e investimento total devem ser maiores que zero.' : 'Consumo, potência, painéis e valor total devem ser maiores que zero.', variant: 'destructive' });
      return;
    }

    if (!Array.isArray(formData.paymentConditions) || formData.paymentConditions.length === 0) {
      toast({ title: 'Condições de pagamento', description: 'Selecione pelo menos uma condição de pagamento.', variant: 'destructive' });
      return;
    }

    const normalizedFinancingConditions: FinancingCondition[] = (formData.financingConditions || [])
      .map((item) => ({
        id: item.id || crypto.randomUUID(),
        institutionName: String(item.institutionName || '').trim(),
        interestRateMonthly: Number(item.interestRateMonthly) || 0,
        installments: Array.from(new Set((item.installments || [])
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0))).sort((a, b) => a - b),
        gracePeriodValue: Math.max(0, Number(item.gracePeriodValue) || 0),
        gracePeriodUnit: (item.gracePeriodUnit === 'meses' ? 'meses' : 'dias') as GracePeriodUnit,
      }))
      .filter((item) => item.institutionName.length > 0 && item.interestRateMonthly > 0 && item.installments.length > 0);

    const hasFinancingSelected = formData.paymentConditions.includes('financiamento_bancario');
    const showFinancingSimulation = hasFinancingSelected && Boolean(formData.showFinancingSimulation);
    if (showFinancingSimulation && normalizedFinancingConditions.length === 0) {
      toast({
        title: 'Condições de financiamento',
        description: 'Para financiar, adicione ao menos 1 instituição com taxa e parcelas.',
        variant: 'destructive',
      });
      return;
    }

    const effectiveFinancingConditions = showFinancingSimulation ? normalizedFinancingConditions : [];
    const financingPrimaryInstitutionId = effectiveFinancingConditions.some((item) => item.id === formData.financingPrimaryInstitutionId)
      ? formData.financingPrimaryInstitutionId
      : (effectiveFinancingConditions[0]?.id || '');
    const primaryCondition = effectiveFinancingConditions.find((item) => item.id === financingPrimaryInstitutionId)
      || effectiveFinancingConditions[0];
    const legacyRate = showFinancingSimulation
      ? (primaryCondition?.interestRateMonthly ?? (Number(formData.taxaFinanciamento) || 0))
      : 0;
    const legacyParcela36 = showFinancingSimulation && primaryCondition?.installments.includes(36)
      ? Math.round(calcPMT(legacyRate, 36, formData.valorTotal) * 100) / 100
      : 0;
    const legacyParcela60 = showFinancingSimulation && primaryCondition?.installments.includes(60)
      ? Math.round(calcPMT(legacyRate, 60, formData.valorTotal) * 100) / 100
      : 0;
    const { financialInputs, financialOutputs } = buildFinancialSnapshot(formData);
    const effectiveEconomiaAnual = Math.max(0, Number(financialOutputs.annualRevenueYear1) || 0);
    const effectivePaybackMeses = Math.max(0, Number(financialOutputs.paybackMonths) || 0);
    const effectiveRentabilityRate = financialInputs.rentabilityRatePerKwh ?? financialInputs.tarifaKwh;
    const effectiveTariffKwh = financialInputs.tarifaKwh;
    const shadowComparison = isFinancialShadowModeEnabled()
      ? (() => {
        const legacyOutputs = calculateProposalFinancials(financialInputs, {
          unifiedGenerationEnabled: false,
          omCostModelEnabled: false,
          degradationAllClientsEnabled: false,
          tusdTeSimplifiedEnabled: false,
        });
        const enhancedOutputs = financialOutputs;
        return {
          enabled: true,
          generatedAt: new Date().toISOString(),
          legacy: {
            annualRevenueYear1: legacyOutputs.annualRevenueYear1,
            paybackMonths: legacyOutputs.paybackMonths,
            roi25Pct: legacyOutputs.roi25Pct,
          },
          enhanced: {
            annualRevenueYear1: enhancedOutputs.annualRevenueYear1,
            paybackMonths: enhancedOutputs.paybackMonths,
            roi25Pct: enhancedOutputs.roi25Pct,
          },
          delta: {
            annualRevenueYear1: enhancedOutputs.annualRevenueYear1 - legacyOutputs.annualRevenueYear1,
            paybackMonths: enhancedOutputs.paybackMonths - legacyOutputs.paybackMonths,
            roi25Pct: enhancedOutputs.roi25Pct - legacyOutputs.roi25Pct,
          },
        };
      })()
      : null;

    if (!themeHydrated || !logoInitialized) {
      toast({
        title: 'Branding ainda carregando',
        description: 'Aguarde alguns segundos e tente novamente para aplicar tema e logo corretamente.',
        variant: 'destructive',
      });
      return;
    }

    const resolvedLogoDataUrl = await ensureLogoDataUrl();
    // Resolve cover gallery (pre-fetched at step 1, or fetch now)
    const resolvedCoverImages = getCoverImageDataUrls(formData.tipo_cliente || 'residencial', 3);
    const hydratedCoverImages = resolvedCoverImages.length >= 3
      ? resolvedCoverImages
      : await prefetchCoverImages(formData.tipo_cliente || 'residencial', 3);
    const resolvedCoverImage = hydratedCoverImages[0]
      || getCoverImageDataUrl(formData.tipo_cliente || 'residencial')
      || await prefetchCoverImage(formData.tipo_cliente || 'residencial');
    if (logoUrl && !resolvedLogoDataUrl) {
      toast({
        title: 'Logo indisponível',
        description: 'Não foi possível carregar a logo da empresa para o PDF. Reenvie a logo e tente novamente.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      // 1) Determine content: AI result or heuristic
      let contextData: Record<string, unknown> | null = null;
      let premiumContent: PremiumProposalContent;

      if (aiContent) {
        // Use AI content (user may have edited the headline)
        premiumContent = { ...aiContent, headline: aiHeadline || aiContent.headline };
        contextData = await fetchContext();
      } else {
        // Heuristic fallback
        contextData = await fetchContext();
        premiumContent = buildHeuristic(contextData);
      }

      // 2) Update lead
      await updateLead({
        contactId: contact.id,
        data: {
          consumo_kwh: formData.consumoMensal,
          valor_estimado: formData.valorTotal,
          tipo_cliente: formData.tipo_cliente,
          endereco: formData.endereco,
          cidade: formData.cidade,
          cep: formData.cep,
          uf: formData.estado,
          concessionaria: formData.concessionaria,
          tipo_ligacao: formData.tipoLigacao,
          tarifa_kwh: effectiveTariffKwh,
          custo_disponibilidade_kwh: formData.custoDisponibilidadeKwh,
          performance_ratio: formData.performanceRatio,
          preco_por_kwp: formData.precoPorKwp,
          abater_custo_disponibilidade_no_dimensionamento: formData.abaterCustoDisponibilidadeNoDimensionamento,
          latitude: formData.latitude,
          longitude: formData.longitude,
          irradiance_source: formData.irradianceSource,
          irradiance_ref_at: formData.irradianceRefAt,
        },
      })
        .catch(err => console.error('Failed to update lead:', err));

      // 3) Generate PDF blob with theme
      const propNum = `PROP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const contactForPdf: Contact = {
        ...contact,
        address: formData.endereco || contact.address,
        city: formData.cidade || contact.city,
        state: formData.estado || contact.state,
        zip: formData.cep || contact.zip,
        latitude: formData.latitude ?? contact.latitude,
        longitude: formData.longitude ?? contact.longitude,
      };
      const pdfBlob = generateProposalPDF({
        contact: contactForPdf,
        ...formData,
        economiaAnual: effectiveEconomiaAnual,
        paybackMeses: effectivePaybackMeses,
        rentabilityRatePerKwh: effectiveRentabilityRate,
        tarifaKwh: financialInputs.tarifaKwh,
        showFinancingSimulation,
        annualEnergyIncreasePct: formData.annualEnergyIncreasePct,
        moduleDegradationPct: formData.moduleDegradationPct,
        annualOmCostPct: formData.annualOmCostPct,
        annualOmCostFixed: formData.annualOmCostFixed,
        teRatePerKwh: formData.teRatePerKwh,
        tusdRatePerKwh: formData.tusdRatePerKwh,
        tusdCompensationPct: formData.tusdCompensationPct,
        financialInputs,
        financialOutputs,
        financialModelVersion: FINANCIAL_MODEL_VERSION,
        monthlyGenerationFactors: formData.monthlyGenerationFactors,
        irradianceSource: formData.irradianceSource,
        latitude: formData.latitude,
        longitude: formData.longitude,
        irradianceRefAt: formData.irradianceRefAt,
        premiumContent,
        colorTheme: theme,
        taxaFinanciamento: legacyRate,
        parcela36x: legacyParcela36,
        parcela60x: legacyParcela60,
        paymentConditions: formData.paymentConditions,
        financingConditions: effectiveFinancingConditions,
        financingPrimaryInstitutionId,
        secondaryColorHex: secondaryColorHex || undefined,
        validadeDias: formData.validadeDias, returnBlob: true,
        propNum,
        logoDataUrl: resolvedLogoDataUrl || logoDataUrl,
        coverImageDataUrl: resolvedCoverImage || null,
        coverImageDataUrls: hydratedCoverImages,
      }) as Blob;

      // 4) Upload + payload
      const fileName = buildProposalFileNameSafe(contact.name, propNum, formData.tipo_cliente === 'usina');
      const storageResult = await uploadPdfToStorage(pdfBlob, contact.id, fileName);
      const brandingSnapshot = {
        proposalThemeId: themeId,
        proposalThemeLabel: theme.label,
        proposalThemeSwatch: theme.swatch,
        secondaryColorHex: secondaryColorHex || null,
        logoUrl: logoUrl || null,
        capturedAt: new Date().toISOString(),
      };
      const premiumPayload: Record<string, unknown> = {
        segment: premiumContent.segment, segmentLabel: premiumContent.segmentLabel,
        headline: premiumContent.headline, executiveSummary: premiumContent.executiveSummary,
        valuePillars: premiumContent.valuePillars, proofPoints: premiumContent.proofPoints,
        objectionHandlers: premiumContent.objectionHandlers, nextStepCta: premiumContent.nextStepCta,
        persuasionScore: premiumContent.persuasionScore, scoreBreakdown: premiumContent.scoreBreakdown,
        variantId: premiumContent.variantId, generatedBy: premiumContent.generatedBy, generatedAt: premiumContent.generatedAt,
        technicalInputs: {
          endereco: formData.endereco,
          cidade: formData.cidade,
          cep: formData.cep,
          estado: formData.estado,
          contaLuzMensal: formData.contaLuzMensal,
          irradiancia: formData.irradiancia,
          concessionaria: formData.concessionaria,
          tipoLigacao: formData.tipoLigacao,
          rentabilityRatePerKwh: effectiveRentabilityRate,
          tarifaKwh: effectiveTariffKwh,
          teRatePerKwh: formData.teRatePerKwh,
          tusdRatePerKwh: formData.tusdRatePerKwh,
          tusdCompensationPct: formData.tusdCompensationPct,
          custoDisponibilidadeKwh: formData.custoDisponibilidadeKwh,
          performanceRatio: formData.performanceRatio,
          precoPorKwp: formData.precoPorKwp,
          abaterCustoDisponibilidadeNoDimensionamento: formData.abaterCustoDisponibilidadeNoDimensionamento,
          monthlyGenerationFactors: formData.monthlyGenerationFactors,
          irradianceSource: formData.irradianceSource,
          latitude: formData.latitude,
          longitude: formData.longitude,
          irradianceRefAt: formData.irradianceRefAt,
          moduloNome: formData.moduloNome,
          moduloMarca: formData.moduloMarca,
          moduloTipo: formData.moduloTipo,
          moduloPotencia: formData.moduloPotencia,
          moduloGarantia: formData.moduloGarantia,
          inversorNome: formData.inversorNome,
          inversorMarca: formData.inversorMarca,
          inversorPotencia: formData.inversorPotencia,
          inversorTensao: formData.inversorTensao,
          inversorGarantia: formData.inversorGarantia,
          inversorQtd: formData.inversorQtd,
          estruturaTipo: formData.estruturaTipo,
          posicaoTelhado: formData.posicaoTelhado,
          sombreamentoPct: formData.sombreamentoPct,
          garantiaServicos: formData.garantiaAnos,
        },
        signature: {
          companyName: formData.signatureCompanyName,
          companyCnpj: formData.signatureCompanyCnpj,
          contractorName: formData.signatureContractorName,
          contractorCnpj: formData.signatureContractorCnpj,
        },
        ...(storageResult ? { storage: storageResult } : {}),
        taxaFinanciamento: legacyRate,
        validadeDias: formData.validadeDias,
        parcela36x: legacyParcela36,
        parcela60x: legacyParcela60,
        paymentConditions: formData.paymentConditions,
        paymentConditionLabels: formData.paymentConditions.map((id) => PAYMENT_CONDITION_LABEL_BY_ID[id]),
        financingConditions: effectiveFinancingConditions,
        financingPrimaryInstitutionId,
        showFinancingSimulation,
        annualEnergyIncreasePct: formData.annualEnergyIncreasePct,
        moduleDegradationPct: formData.moduleDegradationPct,
        annualOmCostPct: formData.annualOmCostPct,
        annualOmCostFixed: formData.annualOmCostFixed,
        teRatePerKwh: formData.teRatePerKwh,
        tusdRatePerKwh: formData.tusdRatePerKwh,
        tusdCompensationPct: formData.tusdCompensationPct,
        financialInputs,
        financialOutputs,
        financialModelVersion: FINANCIAL_MODEL_VERSION,
        monthlyGenerationFactors: formData.monthlyGenerationFactors,
        irradianceSource: formData.irradianceSource,
        latitude: formData.latitude,
        longitude: formData.longitude,
        irradianceRefAt: formData.irradianceRefAt,
        rentabilityRatePerKwh: effectiveRentabilityRate,
        secondaryColorHex: secondaryColorHex || null,
        branding: brandingSnapshot,
        propNum,
        shadowComparison,
      };

      // 5) Save to pipeline (Sprint 3: pass theme/logo for seller script)
      const saveResult = await onGenerate({
        contactId: contact.id,
        ...formData,
        economiaAnual: effectiveEconomiaAnual,
        paybackMeses: effectivePaybackMeses,
        rentabilityRatePerKwh: effectiveRentabilityRate,
        tarifaKwh: financialInputs.tarifaKwh,
        taxaFinanciamento: legacyRate,
        parcela36x: legacyParcela36,
        parcela60x: legacyParcela60,
        paymentConditions: formData.paymentConditions,
        financingConditions: effectiveFinancingConditions,
        financingPrimaryInstitutionId,
        showFinancingSimulation,
        annualEnergyIncreasePct: formData.annualEnergyIncreasePct,
        moduleDegradationPct: formData.moduleDegradationPct,
        annualOmCostPct: formData.annualOmCostPct,
        annualOmCostFixed: formData.annualOmCostFixed,
        teRatePerKwh: formData.teRatePerKwh,
        tusdRatePerKwh: formData.tusdRatePerKwh,
        tusdCompensationPct: formData.tusdCompensationPct,
        financialInputs,
        financialOutputs,
        financialModelVersion: FINANCIAL_MODEL_VERSION,
        monthlyGenerationFactors: formData.monthlyGenerationFactors,
        irradianceSource: formData.irradianceSource,
        latitude: formData.latitude,
        longitude: formData.longitude,
        irradianceRefAt: formData.irradianceRefAt,
        secondaryColorHex: secondaryColorHex || null,
        proposalThemeId: themeId,
        premiumPayload,
        contextEngine: contextData || undefined,
        brandingSnapshot,
        colorTheme: theme,
        logoUrl,
        logoDataUrl: resolvedLogoDataUrl || logoDataUrl,
      });

      // 6) Download to user
      triggerBlobDownloadSafe(pdfBlob, fileName);

      // 7) Share link + tracking (best-effort, background)
      const versionId = (saveResult as any)?.proposalVersionId;
      const propostaId = (saveResult as any)?.proposal?.id;
      if (versionId && storageResult && orgId) {
        const share = await generateShareLink(versionId);
        if (share) {
          try {
            const { data: ver } = await scopeProposalVersionByIdQuery(
              (supabase.from('proposal_versions').select('premium_payload')) as any,
              { proposalVersionId: String(versionId), orgId },
            ).maybeSingle();
            await scopeProposalVersionByIdQuery(
              (supabase.from('proposal_versions').update({ premium_payload: { ...((ver?.premium_payload as Record<string, unknown>) || {}), share } })) as any,
              { proposalVersionId: String(versionId), orgId },
            );
          } catch { /* non-blocking */ }
        }
      }
      if (versionId && propostaId) await trackDownloadEvent(versionId, propostaId, Number(contact.id), 'client_proposal');

      toast({ title: "Proposta gerada!", description: "PDF baixado. Baixe o Roteiro do Vendedor na próxima tela." });
      onClose();
    } catch (error: any) {
      console.error('Error generating proposal:', error);
      const msg = error?.message || error?.toString?.() || 'Erro desconhecido';
      toast({ title: "Erro ao gerar proposta", description: msg.slice(0, 200), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Computed financing preview ──
  // ── Reset on open ──
  React.useEffect(() => {
    const currentContact = contactRef.current;
    if (!currentContact || !isOpen) return;

    setIsLoading(false);
    setLocationLoading(false);
    setAiLoading(false);
    setAiContent(null);
    setAiHeadline('');
    rentabilityManuallyEditedRef.current = false;
    tariffManuallyEditedRef.current = false;
    setRentabilityManuallyEdited(false);
    setTariffManuallyEdited(false);
    const explicitUf = normalizeUf(currentContact.state);
    const inferredUf = inferUfFromCep(currentContact.zip);
    const uf = explicitUf || inferredUf || '';
    const distributorInference = inferDistributor({
      distributor: currentContact.energyDistributor || null,
      uf,
      city: currentContact.city || null,
      cep: currentContact.zip || null,
    });
    const inferredDistributor = distributorInference?.distributor || '';
    const defaultTariffFromDistributor = getDefaultTariffByDistributor(inferredDistributor);
    const leadTariffKwh = Number(currentContact.energyTariffKwh);
    const hasLeadTariff = Number.isFinite(leadTariffKwh) && leadTariffKwh > 0;
    const initialTariff = hasLeadTariff ? leadTariffKwh : (defaultTariffFromDistributor ?? DEFAULT_TARIFF_FALLBACK);
    const initialRentability = hasLeadTariff ? leadTariffKwh : DEFAULT_RENTABILITY_RATE;
    const initialTariffRates = deriveTariffComponents(initialTariff);
    const tipoLigacao = (currentContact.connectionType || 'bifasico') as TipoLigacao;
    const preserveInitialValor = (Number(currentContact.projectValue) || 0) > 0;
    const defaultFinancingCondition = createDefaultFinancingCondition();
    setFormData(prev => recalculateSizing(
      {
        ...prev,
        consumoMensal: currentContact.consumption || 500,
        contaLuzMensal: Math.max(0, (currentContact.consumption || 500) * initialTariff),
        valorTotal: currentContact.projectValue || 0,
        tipo_cliente: (currentContact.clientType || 'residencial') as ClientType,
        observacoes: '',
        endereco: currentContact.address || '',
        cidade: currentContact.city || '',
        cep: currentContact.zip || '',
        signatureCompanyName: '',
        signatureCompanyCnpj: '',
        signatureContractorName: currentContact.name || '',
        signatureContractorCnpj: '',
        garantiaAnos: 25,
        taxaFinanciamento: 1.5,
        parcela36x: 0,
        parcela60x: 0,
        paymentConditions: [...DEFAULT_PAYMENT_CONDITIONS],
        financingConditions: [defaultFinancingCondition],
        financingPrimaryInstitutionId: defaultFinancingCondition.id,
        showFinancingSimulation: false,
        validadeDias: 15,
        annualEnergyIncreasePct: DEFAULT_ANNUAL_INCREASE_PCT,
        moduleDegradationPct: DEFAULT_MODULE_DEGRADATION_PCT,
        annualOmCostPct: 1,
        annualOmCostFixed: 0,
        teRatePerKwh: initialTariffRates.teRatePerKwh,
        tusdRatePerKwh: initialTariffRates.tusdRatePerKwh,
        tusdCompensationPct: 0,
        estado: uf,
        irradiancia: uf ? getIrradianceByUF(uf) : 4.5,
        posicaoTelhado: 'nao_definido',
        sombreamentoPct: ROOF_POSITION_LOSS_MAP.nao_definido,
        monthlyGenerationFactors: undefined,
        irradianceSource: isPvgisBasedSource(currentContact.irradianceSource) ? currentContact.irradianceSource : undefined,
        latitude: currentContact.latitude,
        longitude: currentContact.longitude,
        irradianceRefAt: currentContact.irradianceRefAt || undefined,
        concessionaria: inferredDistributor,
        tipoLigacao,
        rentabilityRatePerKwh: initialRentability,
        tarifaKwh: initialTariff,
        custoDisponibilidadeKwh: currentContact.availabilityCostKwh ?? CUSTO_DISPONIBILIDADE_POR_LIGACAO[tipoLigacao],
        performanceRatio: currentContact.performanceRatio ?? 0.8,
        precoPorKwp: currentContact.pricePerKwp ?? 4500,
        abaterCustoDisponibilidadeNoDimensionamento: currentContact.subtractAvailabilityInSizing ?? false,
        moduloGarantia: 25,
        inversorGarantia: 10,
      },
      { preserveValorTotal: preserveInitialValor },
    ));

    void (async () => {
      const { resource: solarResource } = await resolveSolarResource({
        city: currentContact.city || null,
        uf,
        addressLine: currentContact.address || null,
        zip: currentContact.zip || null,
        lat: currentContact.latitude,
        lon: currentContact.longitude,
      });
      if (!solarResource) return;
      setFormData(prev => recalculateSizing(
        {
          ...prev,
          irradiancia: solarResource.annualIrradianceKwhM2Day,
          monthlyGenerationFactors: solarResource.monthlyGenerationFactors,
          irradianceSource: solarResource.source,
          latitude: solarResource.lat ?? undefined,
          longitude: solarResource.lon ?? undefined,
          irradianceRefAt: new Date().toISOString(),
        },
        { preserveValorTotal: preserveInitialValor },
      ));
    })();
  }, [contact?.id, isOpen, recalculateSizing, resolveSolarResource]);

  const isUsina = formData.tipo_cliente === 'usina';
  const hasFinancingSelected = formData.paymentConditions.includes('financiamento_bancario');
  const primaryFinancingConditionId = formData.financingPrimaryInstitutionId || formData.financingConditions[0]?.id || '';
  const primaryFinancingCondition = formData.financingConditions.find((item) => item.id === primaryFinancingConditionId)
    || formData.financingConditions[0];
  const previewAnnualRevenue = (formData.financialOutputs?.annualRevenueYear1 ?? 0) > 0
    ? (formData.financialOutputs?.annualRevenueYear1 || 0)
    : formData.economiaAnual;
  const previewMonthlyRevenue = (formData.financialOutputs?.monthlyRevenueYear1 ?? 0) > 0
    ? (formData.financialOutputs?.monthlyRevenueYear1 || 0)
    : (previewAnnualRevenue / 12);
  const previewRentabilityRate = Number(formData.rentabilityRatePerKwh ?? formData.tarifaKwh ?? 0) || 0;

  return {
    contact,
    isOpen,
    formData,
    setFormData,
    isLoading,
    locationLoading,
    aiLoading,
    aiContent,
    aiHeadline,
    setAiHeadline,
    isUsina,
    hasFinancingSelected,
    primaryFinancingConditionId,
    primaryFinancingCondition,
    previewAnnualRevenue,
    previewMonthlyRevenue,
    previewRentabilityRate,
    handleChange,
    handleAiPersonalize,
    handleGenerate,
    togglePaymentCondition,
    setPrimaryFinancingInstitution,
    addFinancingCondition,
    removeFinancingCondition,
    updateFinancingCondition,
    toggleInstallment,
    applyRateShortcut,
    formatCurrency,
    resolvePreciseLocation,
    autofillAddressByCep,
    buildFinancialSnapshot,
    recalculateSizing,
    patchAndRecalculate,
    options: {
      BRAZIL_STATES,
      ENERGY_DISTRIBUTOR_OPTIONS,
      getEnergyDistributorOptionsByUf: getEnergyDistributorOptionsByUfSafe,
      PAYMENT_CONDITION_OPTIONS,
      COMMON_FINANCING_INSTITUTIONS,
      INSTALLMENT_OPTIONS,
      MODULE_TYPE_OPTIONS,
      ROOF_POSITION_OPTIONS,
    },
  };
}

export type UseProposalFormReturn = ReturnType<typeof useProposalForm>;

