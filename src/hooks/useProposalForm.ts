import React, { useState, useCallback } from 'react';
import { Contact, ClientType } from '@/types/solarzap';
import { generateProposalPDF } from '@/utils/generateProposalPDF';
import { useToast } from '@/hooks/use-toast';
import { useLeads } from '@/hooks/domain/useLeads';
import { useProposalTheme } from '@/hooks/useProposalTheme';
import { useProposalLogo } from '@/hooks/useProposalLogo';
import { supabase } from '@/lib/supabase';
import { BRAZIL_STATES, getIrradianceByUF } from '@/constants/solarIrradiance';
import {
  isFinancialShadowModeEnabled,
  isTusdTeSimplifiedEnabled,
} from '@/config/featureFlags';
import {
  ENERGY_DISTRIBUTOR_OPTIONS,
  getEnergyDistributorOptionsByUf,
  inferDistributor,
  inferUfFromCep,
  getDefaultTariffByDistributor,
  normalizeUf,
} from '@/constants/energyDistributors';
import {
  DEFAULT_ANALYSIS_YEARS,
  DEFAULT_ANNUAL_INCREASE_PCT,
  DEFAULT_MODULE_DEGRADATION_PCT,
  DEFAULT_TARIFF_FALLBACK,
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
import type { SolarResourceResponse } from '@/types/solarResource';
import { buildProposalFileName, triggerBlobDownload } from '@/utils/pdf/shared';

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
  const { updateLead } = useLeads();
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
    teRatePerKwh: DEFAULT_TARIFF_FALLBACK,
    tusdRatePerKwh: 0,
    tusdCompensationPct: 0,
    financialInputs: undefined as FinancialInputs | undefined,
    financialOutputs: undefined as FinancialOutputs | undefined,
    financialModelVersion: FINANCIAL_MODEL_VERSION as typeof FINANCIAL_MODEL_VERSION,
    // Kit Fotovoltaico
    estado: '' as string,
    irradiancia: 4.5,
    concessionaria: '',
    tipoLigacao: 'bifasico' as TipoLigacao,
    rentabilityRatePerKwh: DEFAULT_TARIFF_FALLBACK,
    tarifaKwh: DEFAULT_TARIFF_FALLBACK,
    custoDisponibilidadeKwh: 50,
    performanceRatio: 0.8,
    precoPorKwp: 4500,
    abaterCustoDisponibilidadeNoDimensionamento: false,
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

  // ── Storage Upload (best-effort) ──
  const uploadPdfToStorage = async (blob: Blob, leadId: string, fileName: string): Promise<{ bucket: string; path: string } | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('proposal-storage-intent', {
        body: { leadId: Number(leadId), fileName, sizeBytes: blob.size, mimeType: 'application/pdf' },
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

  const resolveSolarResource = useCallback(async (params: {
    city?: string | null;
    uf?: string | null;
    addressLine?: string | null;
    zip?: string | null;
    lat?: number;
    lon?: number;
  }): Promise<SolarResourceResponse | null> => {
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
      if (error || !data) return null;
      const monthlyFactors = Array.isArray((data as any).monthlyGenerationFactors)
        ? ((data as any).monthlyGenerationFactors as unknown[])
          .slice(0, 12)
          .map((value) => Math.max(0, Number(value) || 0))
        : [];
      if (monthlyFactors.length !== 12) return null;
      const monthlyIrradiance = Array.isArray((data as any).monthlyIrradianceKwhM2Day)
        ? ((data as any).monthlyIrradianceKwhM2Day as unknown[])
          .slice(0, 12)
          .map((value) => Math.max(0, Number(value) || 0))
        : [];
      if (monthlyIrradiance.length !== 12) return null;
      if (String((data as any).source || '').toLowerCase() !== 'pvgis') return null;

      return {
        source: ((data as any).source || 'pvgis') as SolarResourceResponse['source'],
        lat: Number.isFinite(Number((data as any).lat)) ? Number((data as any).lat) : null,
        lon: Number.isFinite(Number((data as any).lon)) ? Number((data as any).lon) : null,
        annualIrradianceKwhM2Day: Math.max(0.01, Number((data as any).annualIrradianceKwhM2Day) || 4.5),
        monthlyIrradianceKwhM2Day: monthlyIrradiance,
        monthlyGenerationFactors: monthlyFactors,
        referenceYear: Number.isFinite(Number((data as any).referenceYear)) ? Number((data as any).referenceYear) : null,
        cached: Boolean((data as any).cached),
      };
    } catch (err) {
      console.warn('solar-resource strict PVGIS request failed:', err);
      return null;
    }
  }, []);

  const buildFinancialSnapshot = useCallback((next: typeof formData) => {
    const inferredTariff = getDefaultTariffByDistributor(next.concessionaria || '');
    const tariffResolved = resolveTariffByPriority({
      manualTariffKwh: next.rentabilityRatePerKwh ?? next.tarifaKwh ?? null,
      leadTariffKwh: contact?.energyTariffKwh ?? null,
      inferredTariffKwh: inferredTariff,
      fallbackTariffKwh: DEFAULT_TARIFF_FALLBACK,
    });

    const financialInputs: FinancialInputs = {
      tipoCliente: next.tipo_cliente,
      investimentoTotal: Math.max(0, Number(next.valorTotal) || 0),
      consumoMensalKwh: Math.max(0, Number(next.consumoMensal) || 0),
      potenciaSistemaKwp: Math.max(0, Number(next.potenciaSistema) || 0),
      rentabilityRatePerKwh: tariffResolved.tariffKwh,
      tarifaKwh: tariffResolved.tariffKwh,
      rentabilitySource: tariffResolved.source,
      tariffSource: tariffResolved.source,
      custoDisponibilidadeKwh: Math.max(0, Number(next.custoDisponibilidadeKwh) || 0),
      abaterCustoDisponibilidadeNoDimensionamento: Boolean(next.abaterCustoDisponibilidadeNoDimensionamento),
      annualEnergyIncreasePct: Math.max(0, Number(next.annualEnergyIncreasePct) || DEFAULT_ANNUAL_INCREASE_PCT),
      moduleDegradationPct: Math.max(0, Number(next.moduleDegradationPct) || DEFAULT_MODULE_DEGRADATION_PCT),
      annualOmCostPct: Math.max(0, Number(next.annualOmCostPct) || 0),
      annualOmCostFixed: Math.max(0, Number(next.annualOmCostFixed) || 0),
      teRatePerKwh: Math.max(
        0,
        Number(next.teRatePerKwh)
        || Number(next.rentabilityRatePerKwh)
        || Number(next.tarifaKwh)
        || tariffResolved.tariffKwh,
      ),
      tusdRatePerKwh: Math.max(0, Number(next.tusdRatePerKwh) || 0),
      tusdCompensationPct: Math.max(0, Math.min(100, Number(next.tusdCompensationPct) || 0)),
      analysisYears: DEFAULT_ANALYSIS_YEARS,
      monthlyGenerationFactors: next.monthlyGenerationFactors,
      uf: next.estado,
    };
    const financialOutputs = calculateProposalFinancials(financialInputs);
    return { financialInputs, financialOutputs };
  }, [contact?.energyTariffKwh]);

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
      rentabilityRatePerKwh: financialInputs.rentabilityRatePerKwh ?? financialInputs.tarifaKwh,
      tarifaKwh: financialInputs.tarifaKwh,
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
    const rawTariff = Number(next.rentabilityRatePerKwh ?? next.tarifaKwh ?? next.teRatePerKwh);
    return Math.max(0.01, Number.isFinite(rawTariff) && rawTariff > 0 ? rawTariff : DEFAULT_TARIFF_FALLBACK);
  };

  const billToConsumptionKwh = (billValue: number, tariffKwh: number) => {
    const bill = Math.max(0, Number(billValue) || 0);
    return bill / Math.max(0.01, Number(tariffKwh) || DEFAULT_TARIFF_FALLBACK);
  };

  const buildConcessionariaPatch = (
    prev: typeof formData,
    location: { uf?: string; cidade?: string; cep?: string },
  ): Partial<typeof formData> => {
    const uf = normalizeUf(location.uf || prev.estado || contact?.state || '') || undefined;
    const cidade = String(location.cidade || prev.cidade || contact?.city || '').trim() || undefined;
    const cep = normalizeCep(String(location.cep || prev.cep || contact?.zip || '')) || undefined;

    const inference = inferDistributor({
      distributor: prev.concessionaria || contact?.energyDistributor || null,
      uf: uf || null,
      city: cidade || null,
      cep: cep || null,
    });

    const patch: Partial<typeof formData> = {};
    if (inference?.distributor) {
      patch.concessionaria = inference.distributor;
    }

    const tariffFromInference = getDefaultTariffByDistributor(inference?.distributor || patch.concessionaria || prev.concessionaria || '');
    if (!rentabilityManuallyEdited && tariffFromInference !== null) {
      patch.tarifaKwh = tariffFromInference;
      patch.rentabilityRatePerKwh = tariffFromInference;
      patch.teRatePerKwh = tariffFromInference;
      if (prev.tipo_cliente !== 'usina') {
        patch.consumoMensal = billToConsumptionKwh(prev.contaLuzMensal || 0, tariffFromInference);
      }
    }

    return patch;
  };

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

  const resolvePreciseLocation = useCallback(async (override?: LocationOverride) => {
    const requestSeq = ++resolveLocationRequestSeqRef.current;
    const uf = String(
      override?.estado
      || formData.estado
      || normalizeUf(contact?.state)
      || inferUfFromCep(override?.cep || formData.cep || contact?.zip)
      || '',
    ).toUpperCase();
    const cidade = String(override?.cidade || formData.cidade || contact?.city || '').trim();
    const endereco = String(override?.endereco || formData.endereco || contact?.address || '').trim();
    const cep = normalizeCep(String(override?.cep || formData.cep || contact?.zip || ''));
    const hasTextualLocation = Boolean(cidade || endereco || cep);
    const overrideLatitude = toFiniteOrUndefined(override?.latitude);
    const overrideLongitude = toFiniteOrUndefined(override?.longitude);
    const hasOverrideCoordinates = overrideLatitude !== undefined && overrideLongitude !== undefined;
    const currentLatitude = toFiniteOrUndefined(formData.latitude ?? contact?.latitude);
    const currentLongitude = toFiniteOrUndefined(formData.longitude ?? contact?.longitude);

    // Force fresh geocoding from textual location when available.
    const latitude = hasOverrideCoordinates
      ? overrideLatitude
      : (!hasTextualLocation ? currentLatitude : undefined);
    const longitude = hasOverrideCoordinates
      ? overrideLongitude
      : (!hasTextualLocation ? currentLongitude : undefined);

    setLocationLoading(true);
    try {
      const solarResource = await resolveSolarResource({
        city: cidade || undefined,
        uf: uf || undefined,
        addressLine: endereco || undefined,
        zip: cep || undefined,
        lat: latitude,
        lon: longitude,
      });

      if (!solarResource) {
        toast({
          title: 'PVGIS indisponivel',
          description: 'Nao foi possivel obter irradiancia precisa via geocodificacao + PVGIS.',
          variant: 'destructive',
        });
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
        toast({
          title: 'Falha ao buscar dados solares',
          description: 'Tente novamente em alguns segundos.',
          variant: 'destructive',
        });
      }
      return null;
    } finally {
      if (requestSeq === resolveLocationRequestSeqRef.current) {
        setLocationLoading(false);
      }
    }
  }, [
    contact?.address,
    contact?.city,
    contact?.energyDistributor,
    contact?.latitude,
    contact?.longitude,
    contact?.state,
    contact?.zip,
    formData.cep,
    formData.cidade,
    formData.endereco,
    formData.estado,
    formData.latitude,
    formData.longitude,
    patchAndRecalculate,
    rentabilityManuallyEdited,
    resolveSolarResource,
    toast,
  ]);

  const autofillAddressByCep = useCallback(async (rawCep?: string) => {
    const cep = normalizeCep(rawCep || formData.cep || '');
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
        estado: uf || formData.estado || undefined,
        cidade: cidade || formData.cidade || undefined,
        endereco: endereco || formData.endereco || undefined,
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
  }, [
    contact?.city,
    contact?.energyDistributor,
    contact?.state,
    contact?.zip,
    formData.cep,
    formData.cidade,
    formData.endereco,
    formData.estado,
    patchAndRecalculate,
    rentabilityManuallyEdited,
    toast,
  ]);

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
      setRentabilityManuallyEdited(true);
      setFormData(prev => {
        const patch: Partial<typeof formData> = {
          rentabilityRatePerKwh: rate,
          tarifaKwh: rate,
          teRatePerKwh: isTusdTeSimplifiedEnabled() ? rate : prev.teRatePerKwh,
        };
        if (prev.tipo_cliente !== 'usina') {
          patch.consumoMensal = billToConsumptionKwh(prev.contaLuzMensal || 0, Math.max(0.01, rate || DEFAULT_TARIFF_FALLBACK));
        }
        return patchAndRecalculate(prev, patch);
      });
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
      setRentabilityManuallyEdited(true);
      setFormData(prev => {
        const patch: Partial<typeof formData> = {
          tarifaKwh: rate,
          rentabilityRatePerKwh: rate,
          teRatePerKwh: isTusdTeSimplifiedEnabled() ? rate : prev.teRatePerKwh,
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
        if (!rentabilityManuallyEdited && tariffFromInference !== null) {
          patch.tarifaKwh = tariffFromInference;
          patch.rentabilityRatePerKwh = tariffFromInference;
          patch.teRatePerKwh = tariffFromInference;
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
        if (!rentabilityManuallyEdited && inferredTariff !== null) {
          patch.tarifaKwh = inferredTariff;
          patch.rentabilityRatePerKwh = inferredTariff;
          patch.teRatePerKwh = inferredTariff;
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
        body: { leadId: Number(contact.id), limitInteractions: 18, limitComments: 8, limitDocuments: 4 },
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

    if (formData.irradianceSource !== 'pvgis' || !Number.isFinite(Number(formData.latitude)) || !Number.isFinite(Number(formData.longitude))) {
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
          tarifa_kwh: effectiveRentabilityRate,
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
      }) as Blob;

      // 4) Upload + payload
      const fileName = buildProposalFileName(contact.name, propNum, formData.tipo_cliente === 'usina');
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
          tarifaKwh: effectiveRentabilityRate,
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
      triggerBlobDownload(pdfBlob, fileName);

      // 7) Share link + tracking (best-effort, background)
      const versionId = (saveResult as any)?.proposalVersionId;
      const propostaId = (saveResult as any)?.proposal?.id;
      if (versionId && storageResult) {
        const share = await generateShareLink(versionId);
        if (share) {
          try {
            const { data: ver } = await supabase.from('proposal_versions').select('premium_payload').eq('id', versionId).maybeSingle();
            await supabase.from('proposal_versions').update({ premium_payload: { ...((ver?.premium_payload as Record<string, unknown>) || {}), share } }).eq('id', versionId);
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
    if (contact && isOpen) {
      setIsLoading(false);
      setLocationLoading(false);
      setAiLoading(false);
      setAiContent(null);
      setAiHeadline('');
      setRentabilityManuallyEdited(false);
      const explicitUf = normalizeUf(contact.state);
      const inferredUf = inferUfFromCep(contact.zip);
      const uf = explicitUf || inferredUf || '';
      const distributorInference = inferDistributor({
        distributor: contact.energyDistributor || null,
        uf,
        city: contact.city || null,
        cep: contact.zip || null,
      });
      const inferredDistributor = distributorInference?.distributor || '';
      const defaultTariffFromDistributor = getDefaultTariffByDistributor(inferredDistributor);
      const initialRentability = contact.energyTariffKwh ?? defaultTariffFromDistributor ?? DEFAULT_TARIFF_FALLBACK;
      const tipoLigacao = (contact.connectionType || 'bifasico') as TipoLigacao;
      const preserveInitialValor = (Number(contact.projectValue) || 0) > 0;
      const defaultFinancingCondition = createDefaultFinancingCondition();
      setFormData(prev => recalculateSizing(
        {
          ...prev,
          consumoMensal: contact.consumption || 500,
          contaLuzMensal: Math.max(0, (contact.consumption || 500) * initialRentability),
          valorTotal: contact.projectValue || 0,
          tipo_cliente: (contact.clientType || 'residencial') as ClientType,
          observacoes: '',
          endereco: contact.address || '',
          cidade: contact.city || '',
          cep: contact.zip || '',
          signatureCompanyName: '',
          signatureCompanyCnpj: '',
          signatureContractorName: contact.name || '',
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
          teRatePerKwh: initialRentability,
          tusdRatePerKwh: 0,
          tusdCompensationPct: 0,
          estado: uf,
          irradiancia: uf ? getIrradianceByUF(uf) : 4.5,
          monthlyGenerationFactors: undefined,
          irradianceSource: contact.irradianceSource === 'pvgis' ? 'pvgis' : undefined,
          latitude: contact.latitude,
          longitude: contact.longitude,
          irradianceRefAt: contact.irradianceRefAt || undefined,
          concessionaria: inferredDistributor,
          tipoLigacao,
          rentabilityRatePerKwh: initialRentability,
          tarifaKwh: initialRentability,
          custoDisponibilidadeKwh: contact.availabilityCostKwh ?? CUSTO_DISPONIBILIDADE_POR_LIGACAO[tipoLigacao],
          performanceRatio: contact.performanceRatio ?? 0.8,
          precoPorKwp: contact.pricePerKwp ?? 4500,
          abaterCustoDisponibilidadeNoDimensionamento: contact.subtractAvailabilityInSizing ?? false,
          moduloGarantia: 25,
          inversorGarantia: 10,
        },
        { preserveValorTotal: preserveInitialValor },
      ));

      void (async () => {
        const solarResource = await resolveSolarResource({
          city: contact.city || null,
          uf,
          addressLine: contact.address || null,
          zip: contact.zip || null,
          lat: contact.latitude,
          lon: contact.longitude,
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
    }
  }, [contact, isOpen, recalculateSizing, resolveSolarResource]);

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
      getEnergyDistributorOptionsByUf,
      PAYMENT_CONDITION_OPTIONS,
      COMMON_FINANCING_INSTITUTIONS,
      INSTALLMENT_OPTIONS,
      MODULE_TYPE_OPTIONS,
    },
  };
}

export type UseProposalFormReturn = ReturnType<typeof useProposalForm>;

