import React, { useState, useCallback } from 'react';
import { Contact, ClientType } from '@/types/solarzap';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, FileText, Zap, DollarSign, Sun, Battery, Shield, Download, User,
  Sparkles, Calendar, CreditCard,
} from 'lucide-react';
import { generateProposalPDF } from '@/utils/generateProposalPDF';
import { useToast } from '@/hooks/use-toast';
import { useLeads } from '@/hooks/domain/useLeads';
import { useProposalTheme } from '@/hooks/useProposalTheme';
import { useProposalLogo } from '@/hooks/useProposalLogo';
import { supabase } from '@/lib/supabase';
import { BRAZIL_STATES, getIrradianceByUF } from '@/constants/solarIrradiance';
import { isSolarResourceApiEnabled, isTusdTeSimplifiedEnabled } from '@/config/featureFlags';
import {
  ENERGY_DISTRIBUTOR_OPTIONS,
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

interface ProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  onGenerate: (data: ProposalData) => Promise<{ proposalVersionId: string | null; proposal?: any } | void>;
}

export interface ProposalData {
  contactId: string;
  consumoMensal: number;
  potenciaSistema: number;
  quantidadePaineis: number;
  valorTotal: number;
  economiaAnual: number;
  paybackMeses: number;
  garantiaAnos: number;
  observacoes?: string;
  tipo_cliente?: ClientType;
  estado?: string;
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
  colorTheme?: import('@/utils/proposalColorThemes').ProposalColorTheme;
  logoDataUrl?: string | null;
  moduloGarantia?: number;
  signatureCompanyName?: string;
  signatureCompanyCnpj?: string;
  signatureContractorName?: string;
  signatureContractorCnpj?: string;
}

import { calcPMT } from '@/utils/financingCalc';

const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'residencial', label: 'Residencial' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'rural', label: 'Rural' },
  { value: 'usina', label: 'Usina Solar' },
];

// ── PMT calc — uses shared utility ──

const RATE_SHORTCUTS = [
  { label: 'Otimista 1,30%', rate: 1.3 },
  { label: 'Padrão 1,50%', rate: 1.5 },
  { label: 'Conservador 1,90%', rate: 1.9 },
];

type TipoLigacao = 'monofasico' | 'bifasico' | 'trifasico';

const TIPOS_LIGACAO: { value: TipoLigacao; label: string }[] = [
  { value: 'monofasico', label: 'Monofásico (30 kWh)' },
  { value: 'bifasico', label: 'Bifásico (50 kWh)' },
  { value: 'trifasico', label: 'Trifásico (100 kWh)' },
];

const CUSTO_DISPONIBILIDADE_POR_LIGACAO: Record<TipoLigacao, number> = {
  monofasico: 30,
  bifasico: 50,
  trifasico: 100,
};

const DEFAULT_PAYMENT_CONDITIONS: PaymentConditionOptionId[] = ['pix_avista', 'boleto_avista'];

function createDefaultFinancingCondition(): FinancingCondition {
  return {
    id: crypto.randomUUID(),
    institutionName: '',
    interestRateMonthly: 1.5,
    installments: [36, 60],
    gracePeriodValue: 0,
    gracePeriodUnit: 'dias',
  };
}

export function ProposalModal({ isOpen, onClose, contact, onGenerate }: ProposalModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiContent, setAiContent] = useState<PremiumProposalContent | null>(null);
  const [aiHeadline, setAiHeadline] = useState('');
  const [rentabilityManuallyEdited, setRentabilityManuallyEdited] = useState(false);
  const { updateLead } = useLeads();
  const { toast } = useToast();
  const { theme, secondaryColorHex } = useProposalTheme();
  const { logoDataUrl } = useProposalLogo();

  const [formData, setFormData] = useState({
    consumoMensal: contact?.consumption || 0,
    potenciaSistema: 0,
    quantidadePaineis: 0,
    valorTotal: contact?.projectValue || 0,
    economiaAnual: 0,
    paybackMeses: 0,
    garantiaAnos: 25,
    observacoes: '',
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
    lat?: number;
    lon?: number;
  }): Promise<SolarResourceResponse | null> => {
    if (!isSolarResourceApiEnabled()) return null;
    try {
      const { data, error } = await supabase.functions.invoke('solar-resource', {
        body: {
          city: params.city || undefined,
          uf: params.uf || undefined,
          lat: params.lat,
          lon: params.lon,
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

      return {
        source: ((data as any).source || 'uf_fallback') as SolarResourceResponse['source'],
        lat: Number.isFinite(Number((data as any).lat)) ? Number((data as any).lat) : null,
        lon: Number.isFinite(Number((data as any).lon)) ? Number((data as any).lon) : null,
        annualIrradianceKwhM2Day: Math.max(0.01, Number((data as any).annualIrradianceKwhM2Day) || 4.5),
        monthlyIrradianceKwhM2Day: monthlyIrradiance,
        monthlyGenerationFactors: monthlyFactors,
        referenceYear: Number.isFinite(Number((data as any).referenceYear)) ? Number((data as any).referenceYear) : null,
        cached: Boolean((data as any).cached),
      };
    } catch (err) {
      console.warn('solar-resource fallback to UF irradiance:', err);
      return null;
    }
  }, []);

  // ── Auto-calculate system for ALL types using Kit equipment data ──
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

  const calculateSystem = useCallback((consumo: number) => {
    setFormData(prev => patchAndRecalculate(prev, { consumoMensal: consumo }));
  }, [patchAndRecalculate]);

  const handleChange = (field: keyof typeof formData, value: number | string | boolean) => {
    if (field === 'consumoMensal') {
      calculateSystem(value as number);
      return;
    }

    if (
      field === 'moduloPotencia'
      || field === 'irradiancia'
      || field === 'custoDisponibilidadeKwh'
      || field === 'performanceRatio'
      || field === 'precoPorKwp'
      || field === 'tipo_cliente'
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
      setFormData(prev => patchAndRecalculate(prev, {
        rentabilityRatePerKwh: rate,
        tarifaKwh: rate,
        teRatePerKwh: isTusdTeSimplifiedEnabled() ? rate : prev.teRatePerKwh,
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
      setRentabilityManuallyEdited(true);
      setFormData(prev => patchAndRecalculate(prev, {
        tarifaKwh: rate,
        rentabilityRatePerKwh: rate,
        teRatePerKwh: isTusdTeSimplifiedEnabled() ? rate : prev.teRatePerKwh,
      }));
      return;
    }

    if (field === 'estado') {
      const uf = value as string;
      const irrad = getIrradianceByUF(uf);
      const irradianceRefAt = new Date().toISOString();
      setFormData(prev => {
        const patch: Partial<typeof formData> = {
          estado: uf,
          irradiancia: irrad,
          irradianceSource: 'uf_fallback',
          irradianceRefAt,
          monthlyGenerationFactors: undefined,
        };
        const inference = inferDistributor({
          uf,
          city: contact?.city || null,
          cep: contact?.zip || null,
        });
        if (!prev.concessionaria && inference?.distributor) {
          patch.concessionaria = inference.distributor;
        }
        const tariffFromInference = getDefaultTariffByDistributor(inference?.distributor || patch.concessionaria || '');
        if (!rentabilityManuallyEdited && tariffFromInference !== null) {
          patch.tarifaKwh = tariffFromInference;
          patch.rentabilityRatePerKwh = tariffFromInference;
          patch.teRatePerKwh = tariffFromInference;
        }
        return patchAndRecalculate(prev, patch);
      });

      void (async () => {
        const solarResource = await resolveSolarResource({
          city: contact?.city || null,
          uf,
          lat: contact?.latitude,
          lon: contact?.longitude,
        });
        if (!solarResource) return;
        setFormData(prev => {
          if (prev.estado !== uf) return prev;
          return patchAndRecalculate(prev, {
            irradiancia: solarResource.annualIrradianceKwhM2Day,
            monthlyGenerationFactors: solarResource.monthlyGenerationFactors,
            irradianceSource: solarResource.source,
            latitude: solarResource.lat ?? undefined,
            longitude: solarResource.lon ?? undefined,
            irradianceRefAt: new Date().toISOString(),
          });
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
          city: contact.city || undefined,
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
      const pdfBlob = generateProposalPDF({
        contact,
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
        logoDataUrl,
      }) as Blob;

      // 4) Upload + payload
      const fileName = `Proposta_${formData.tipo_cliente === 'usina' ? 'Usina' : 'Energia'}_Solar_${contact.name.replace(/\s+/g, '_')}_${propNum}.pdf`;
      const storageResult = await uploadPdfToStorage(pdfBlob, contact.id, fileName);
      const premiumPayload: Record<string, unknown> = {
        segment: premiumContent.segment, segmentLabel: premiumContent.segmentLabel,
        headline: premiumContent.headline, executiveSummary: premiumContent.executiveSummary,
        valuePillars: premiumContent.valuePillars, proofPoints: premiumContent.proofPoints,
        objectionHandlers: premiumContent.objectionHandlers, nextStepCta: premiumContent.nextStepCta,
        persuasionScore: premiumContent.persuasionScore, scoreBreakdown: premiumContent.scoreBreakdown,
        variantId: premiumContent.variantId, generatedBy: premiumContent.generatedBy, generatedAt: premiumContent.generatedAt,
        technicalInputs: {
          estado: formData.estado,
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
          moduloGarantia: formData.moduloGarantia,
          inversorGarantia: formData.inversorGarantia,
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
        propNum,
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
        premiumPayload,
        contextEngine: contextData || undefined,
        colorTheme: theme,
        logoDataUrl,
      });

      // 6) Download to user
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a'); a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);

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
          valorTotal: contact.projectValue || 0,
          tipo_cliente: (contact.clientType || 'residencial') as ClientType,
          observacoes: '',
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
          irradianceSource: contact.irradianceSource || 'uf_fallback',
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

  if (!contact || !isOpen) return null;

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="w-5 h-5 text-green-500" />
            Gerar Proposta em PDF
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Preencha os dados e gere a proposta personalizada para <strong>{contact.name}</strong>.
          </p>
        </DialogHeader>

        {(isLoading || aiLoading) && (
          <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 animate-spin text-green-500 mb-4" />
            <p className="font-semibold text-lg">{aiLoading ? 'Personalizando com IA...' : 'Gerando proposta...'}</p>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs text-center">
              {aiLoading
                ? 'Analisando conversas, comentários e contexto do lead para personalizar a proposta'
                : 'Coletando contexto e gerando o PDF profissional'}
            </p>
          </div>
        )}

        <form onSubmit={handleGenerate} className="space-y-5">
          {/* Client bar */}
          <div className="p-3 bg-muted rounded-lg flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xl">{contact.avatar || '👤'}</div>
            <div>
              <div className="font-semibold">{contact.name}</div>
              <div className="text-sm text-muted-foreground">{[contact.company, contact.phone].filter(Boolean).join(' • ')}</div>
            </div>
          </div>

          {/* ── KIT FOTOVOLTAICO ── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <Sun className="w-4 h-4" /> Kit Fotovoltaico
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Estado (UF)</Label>
                <Select value={formData.estado} onValueChange={(v) => handleChange('estado', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o estado" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover max-h-60">
                    {BRAZIL_STATES.map((s) => (
                      <SelectItem key={s.uf} value={s.uf}>
                        {s.uf} - {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Irradiância Solar (kWh/m²/dia)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.irradiancia || ''}
                  onChange={(e) => handleChange('irradiancia', parseFloat(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">Preenchido pelo estado. Altere se necessário.</p>
              </div>
            </div>

            {/* Módulo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Concessionaria de Energia</Label>
                <Input
                  list="proposal-concessionaria-list"
                  placeholder="Ex: Neoenergia Coelba"
                  value={formData.concessionaria}
                  onChange={(e) => handleChange('concessionaria', e.target.value)}
                />
                <datalist id="proposal-concessionaria-list">
                  {ENERGY_DISTRIBUTOR_OPTIONS.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">Sugestao automatica por UF quando disponivel. Pode editar.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo de Ligacao</Label>
                <Select value={formData.tipoLigacao} onValueChange={(v) => handleChange('tipoLigacao', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {TIPOS_LIGACAO.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Custo de Disponibilidade (kWh)</Label>
                <Input
                  type="number"
                  value={formData.custoDisponibilidadeKwh || ''}
                  onChange={(e) => handleChange('custoDisponibilidadeKwh', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fator de Performance (PR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.performanceRatio || ''}
                  onChange={(e) => handleChange('performanceRatio', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Preco por kWp (R$)</Label>
                <Input
                  type="number"
                  step="1"
                  value={formData.precoPorKwp || ''}
                  onChange={(e) => handleChange('precoPorKwp', parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="flex items-start gap-2 p-2 rounded border bg-muted/10">
              <Checkbox
                id="abater-custo-disp"
                checked={Boolean(formData.abaterCustoDisponibilidadeNoDimensionamento)}
                onCheckedChange={(checked) => handleChange('abaterCustoDisponibilidadeNoDimensionamento', Boolean(checked))}
              />
              <div className="space-y-1">
                <Label htmlFor="abater-custo-disp" className="text-xs">
                  Abater custo de disponibilidade no dimensionamento
                </Label>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, o cálculo de módulos/potência usa consumo compensável (consumo - custo de disponibilidade).
                </p>
              </div>
            </div>

            <div className="p-3 border rounded-lg space-y-2 bg-muted/10">
              <Label className="text-xs font-semibold">Módulo</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Nome / Modelo</Label>
                  <Input placeholder="Ex: HANERSUN HN21RN-66HT" value={formData.moduloNome} onChange={(e) => handleChange('moduloNome', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Marca</Label>
                  <Input placeholder="Ex: HANERSUN" value={formData.moduloMarca} onChange={(e) => handleChange('moduloMarca', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Potência (W)</Label>
                  <Input type="number" value={formData.moduloPotencia || ''} onChange={(e) => handleChange('moduloPotencia', parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Input placeholder="Ex: Monocristalino" value={formData.moduloTipo} onChange={(e) => handleChange('moduloTipo', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Garantia (anos)</Label>
                  <Input type="number" value={formData.moduloGarantia || ''} onChange={(e) => handleChange('moduloGarantia', parseInt(e.target.value) || 0)} />
                </div>
              </div>
            </div>

            {/* Inversor */}
            <div className="p-3 border rounded-lg space-y-2 bg-muted/10">
              <Label className="text-xs font-semibold">Inversor</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Nome / Modelo</Label>
                  <Input placeholder="Ex: CHINT SCA75K" value={formData.inversorNome} onChange={(e) => handleChange('inversorNome', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Marca</Label>
                  <Input placeholder="Ex: CHINT" value={formData.inversorMarca} onChange={(e) => handleChange('inversorMarca', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Potência (kWp)</Label>
                  <Input type="number" value={formData.inversorPotencia || ''} onChange={(e) => handleChange('inversorPotencia', parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tensão (V)</Label>
                  <Input type="number" value={formData.inversorTensao || ''} onChange={(e) => handleChange('inversorTensao', parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Garantia (anos)</Label>
                  <Input type="number" value={formData.inversorGarantia || ''} onChange={(e) => handleChange('inversorGarantia', parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantidade</Label>
                  <Input type="number" value={formData.inversorQtd || ''} onChange={(e) => handleChange('inversorQtd', parseInt(e.target.value) || 0)} />
                </div>
              </div>
            </div>

            {/* Estrutura */}
            <div className="p-3 border rounded-lg space-y-2 bg-muted/10">
              <Label className="text-xs font-semibold">Estrutura</Label>
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Input placeholder="Ex: SOLO 2 LINHAS / Telhado Cerâmico" value={formData.estruturaTipo} onChange={(e) => handleChange('estruturaTipo', e.target.value)} />
              </div>
            </div>

          </div>

          {/* ── DIMENSIONAMENTO ── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <Zap className="w-4 h-4" /> {isUsina ? 'Dimensionamento da Usina' : 'Dimensionamento do Sistema'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><User className="w-3 h-3" /> Tipo de Cliente</Label>
                <Select value={formData.tipo_cliente} onValueChange={(v) => handleChange('tipo_cliente', v as ClientType)}>
                  <SelectTrigger data-testid="proposal-client-type-trigger"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Zap className="w-3 h-3" /> {isUsina ? 'Geração Estimada (kWh/mês)' : 'Consumo Mensal (kWh)'}</Label>
                <Input type="number" value={formData.consumoMensal || ''} onChange={(e) => handleChange('consumoMensal', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Sun className="w-3 h-3" /> {isUsina ? 'Potência Instalada (kWp)' : 'Potência (kWp)'}</Label>
                <Input type="number" step="0.1" value={formData.potenciaSistema || ''} onChange={(e) => handleChange('potenciaSistema', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Battery className="w-3 h-3" /> {isUsina ? 'Módulos' : 'Painéis'}</Label>
                <Input type="number" value={formData.quantidadePaineis || ''} onChange={(e) => handleChange('quantidadePaineis', parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Shield className="w-3 h-3" /> Garantia dos Servicos (anos)</Label>
                <Input type="number" value={formData.garantiaAnos || ''} onChange={(e) => handleChange('garantiaAnos', parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" /> Validade (dias)</Label>
                <Input type="number" value={formData.validadeDias} onChange={(e) => handleChange('validadeDias', parseInt(e.target.value) || 15)} />
              </div>
            </div>
          </div>

          {/* ── VALORES ── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Valores
            </h3>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg text-center min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">{isUsina ? 'Investimento Total' : 'Valor Total'}</div>
                <div className="text-sm font-bold text-green-600 truncate">{formatCurrency(formData.valorTotal)}</div>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-center min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">{isUsina ? 'Receita Mensal Estimada' : 'Economia Anual'}</div>
                <div className="text-sm font-bold text-blue-600 truncate">{formatCurrency(isUsina ? previewMonthlyRevenue : formData.economiaAnual)}</div>
                {isUsina && (
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    Anual: {formatCurrency(previewAnnualRevenue)}
                  </div>
                )}
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg text-center min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Payback</div>
                <div className="text-sm font-bold text-purple-600 truncate">{formData.paybackMeses} meses</div>
              </div>
            </div>
            {/* Editable value */}
            <div className="space-y-1.5">
              <Label className="text-xs">{isUsina ? 'Investimento Total (R$)' : 'Valor Total (R$)'}</Label>
              <Input type="number" value={formData.valorTotal || ''} onChange={(e) => handleChange('valorTotal', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rentabilidade do kW (R$/kWh produzido)</Label>
              <Input
                type="number"
                step="0.0001"
                value={formData.rentabilityRatePerKwh || ''}
                onChange={(e) => handleChange('rentabilityRatePerKwh', parseFloat(e.target.value) || 0)}
              />
              {isUsina ? (
                <p className="text-[11px] text-muted-foreground">
                  Exemplo aplicado: {Math.round(formData.consumoMensal || 0)} kWh/mês × R$ {previewRentabilityRate.toFixed(4)} = {formatCurrency(previewMonthlyRevenue)}/mês ({formatCurrency(previewAnnualRevenue)}/ano).
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Esse valor define a receita/economia anual projetada para todos os segmentos.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Aumento anual de tarifa/receita (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.annualEnergyIncreasePct ?? DEFAULT_ANNUAL_INCREASE_PCT}
                  onChange={(e) => handleChange('annualEnergyIncreasePct', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Degradacao anual dos modulos (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.moduleDegradationPct ?? DEFAULT_MODULE_DEGRADATION_PCT}
                  onChange={(e) => handleChange('moduleDegradationPct', parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          {/* -- CONDICOES DE PAGAMENTO / FINANCIAMENTO -- */}
          <div className="space-y-3 p-4 border rounded-lg bg-muted/30 overflow-hidden">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> {isUsina ? 'Pagamento e Financiamento' : 'Condicoes Comerciais'}
            </h3>

            <div className="space-y-2">
              <Label className="text-xs">Condicoes de pagamento</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PAYMENT_CONDITION_OPTIONS.map((option) => {
                  const checked = formData.paymentConditions.includes(option.id);
                  return (
                    <label
                      key={option.id}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${checked ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => togglePaymentCondition(option.id)} />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {hasFinancingSelected && (
              <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                <div>
                  <Label className="text-xs">Exibir simulacao de financiamento na proposta</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Financiamento pode ser uma forma de pagamento sem obrigar tabela de parcelas.
                  </p>
                </div>
                <Checkbox
                  checked={Boolean(formData.showFinancingSimulation)}
                  onCheckedChange={(checked) => handleChange('showFinancingSimulation', Boolean(checked))}
                />
              </div>
            )}

            {hasFinancingSelected && formData.showFinancingSimulation && (
              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Condicoes de financiamento</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addFinancingCondition}>
                    Adicionar instituicao
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {RATE_SHORTCUTS.map((shortcut) => (
                    <Button
                      key={shortcut.rate}
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`text-xs truncate ${primaryFinancingCondition?.interestRateMonthly === shortcut.rate ? 'border-primary bg-primary/10' : ''}`}
                      onClick={() => applyRateShortcut(shortcut.rate)}
                    >
                      {shortcut.label}
                    </Button>
                  ))}
                </div>

                {formData.financingConditions.map((condition, index) => {
                  const sortedInstallments = Array.from(new Set((condition.installments || [])
                    .map((value) => Number(value))
                    .filter((value) => Number.isFinite(value) && value > 0))).sort((a, b) => a - b);
                  const isPrimary = primaryFinancingConditionId === condition.id;

                  return (
                    <div key={condition.id} className="rounded-lg border bg-background p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <Checkbox
                            checked={isPrimary}
                            onCheckedChange={(checked) => {
                              if (checked) setPrimaryFinancingInstitution(condition.id);
                            }}
                          />
                          <span>{`Instituicao ${index + 1}${isPrimary ? ' (principal)' : ''}`}</span>
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFinancingCondition(condition.id)}
                          disabled={formData.financingConditions.length <= 1}
                        >
                          Remover
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Instituicao financeira</Label>
                          <Input
                            value={condition.institutionName}
                            onChange={(e) => updateFinancingCondition(condition.id, 'institutionName', e.target.value)}
                            placeholder="Ex: Santander"
                            list="common-financing-institutions"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Taxa de juros (% a.m.)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={condition.interestRateMonthly || ''}
                            onChange={(e) => updateFinancingCondition(condition.id, 'interestRateMonthly', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Prazo de carencia</Label>
                          <div className="grid grid-cols-[1fr_120px] gap-2">
                            <Input
                              type="number"
                              min={0}
                              value={condition.gracePeriodValue || 0}
                              onChange={(e) => updateFinancingCondition(condition.id, 'gracePeriodValue', Math.max(0, parseInt(e.target.value, 10) || 0))}
                            />
                            <Select
                              value={condition.gracePeriodUnit}
                              onValueChange={(value) => updateFinancingCondition(condition.id, 'gracePeriodUnit', value as GracePeriodUnit)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-popover">
                                <SelectItem value="dias">dias</SelectItem>
                                <SelectItem value="meses">meses</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Numero de parcelas para simular</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {INSTALLMENT_OPTIONS.map((installment) => {
                            const selected = sortedInstallments.includes(installment);
                            return (
                              <Button
                                key={`${condition.id}-${installment}`}
                                type="button"
                                variant="outline"
                                size="sm"
                                className={`h-7 px-2 text-xs ${selected ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
                                onClick={() => toggleInstallment(condition.id, installment)}
                              >
                                {installment}x
                              </Button>
                            );
                          })}
                        </div>
                      </div>

                      {sortedInstallments.length > 0 && condition.interestRateMonthly > 0 && formData.valorTotal > 0 && (
                        <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                          {sortedInstallments.map((installment) => {
                            const installmentValue = calcPMT(condition.interestRateMonthly, installment, formData.valorTotal);
                            return (
                              <div key={`${condition.id}-preview-${installment}`} className="flex items-center justify-between">
                                <span>{installment}x</span>
                                <span className="font-medium text-foreground">{formatCurrency(installmentValue)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                <datalist id="common-financing-institutions">
                  {COMMON_FINANCING_INSTITUTIONS.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>

                <p className="text-xs text-muted-foreground">
                  Carencia e apenas informativa para exibicao comercial. O calculo da parcela usa PMT simples sem capitalizar carencia.
                </p>
              </div>
            )}

            {hasFinancingSelected && !formData.showFinancingSimulation && (
              <p className="text-xs text-muted-foreground">
                Financiamento marcado apenas como possibilidade de pagamento. Nenhuma simulacao de parcelas sera exibida no PDF.
              </p>
            )}

            {!hasFinancingSelected && (
              <p className="text-xs text-muted-foreground">
                Marque &quot;Financiamento bancario&quot; para habilitar simulacoes por instituicao.
              </p>
            )}
          </div>
          {/* -- ASSINATURA -- */}
          <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide">
              Assinatura na proposta
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome da empresa</Label>
                <Input
                  value={formData.signatureCompanyName || ''}
                  onChange={(e) => handleChange('signatureCompanyName', e.target.value)}
                  placeholder="Ex: IBS ENERGIA SOLAR LTDA"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CNPJ da empresa</Label>
                <Input
                  value={formData.signatureCompanyCnpj || ''}
                  onChange={(e) => handleChange('signatureCompanyCnpj', e.target.value)}
                  placeholder="00.000.000/0001-00"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome do contratante</Label>
                <Input
                  value={formData.signatureContractorName || ''}
                  onChange={(e) => handleChange('signatureContractorName', e.target.value)}
                  placeholder="Ex: JOAO DA SILVA"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CNPJ do contratante</Label>
                <Input
                  value={formData.signatureContractorCnpj || ''}
                  onChange={(e) => handleChange('signatureContractorCnpj', e.target.value)}
                  placeholder="00.000.000/0001-00"
                />
              </div>
            </div>
          </div>

          {/* ── OBSERVAÇÕES ── */}
          <div className="space-y-1.5">
            <Label className="text-xs">Observações da Proposta (opcional)</Label>
            <Textarea value={formData.observacoes} onChange={(e) => handleChange('observacoes', e.target.value)}
              placeholder="Condições especiais, observações técnicas..." rows={2} />
          </div>

          {/* ── AI PERSONALIZATION ── */}
          <div className="p-4 border rounded-lg bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" /> Personalização com IA
              </h3>
              <Button type="button" variant="outline" size="sm" onClick={handleAiPersonalize}
                disabled={aiLoading || isLoading} className="gap-1.5">
                {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {aiContent ? 'Atualizar' : 'Personalizar com IA'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A IA analisa as <strong>conversas</strong> e <strong>comentários internos</strong> do lead para criar texto personalizado. Números vêm do formulário acima. Opcional — sem IA, uma personalização básica é aplicada.
            </p>
            {aiContent && (
              <div className="space-y-2 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Mensagem principal (editável)</Label>
                  <Input value={aiHeadline} onChange={(e) => setAiHeadline(e.target.value)}
                    className="text-sm" placeholder="Headline personalizada..." />
                </div>
                {aiContent.executiveSummary && (
                  <div className="p-2.5 bg-background border rounded text-xs text-muted-foreground leading-relaxed">
                    {aiContent.executiveSummary.slice(0, 200)}{aiContent.executiveSummary.length > 200 ? '...' : ''}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${aiContent.generatedBy === 'ai' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {aiContent.generatedBy === 'ai' ? '✨ IA' : '📐 Heurística'}
                  </span>
                  {aiContent.persuasionScore > 0 && (
                    <span>Score: {aiContent.persuasionScore}/100</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── FOOTER ── */}
          <DialogFooter className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
            <Button type="submit" disabled={isLoading}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white flex-1"
              data-testid="proposal-generate-pdf"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
              ) : (
                <><Download className="w-4 h-4" /> Gerar e Baixar PDF</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
