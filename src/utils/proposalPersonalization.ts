import { ClientType, Contact } from '@/types/solarzap';

export type ProposalSegment = 'residencial' | 'empresarial' | 'agronegocio' | 'usina' | 'indefinido';

export interface ProposalMetrics {
  consumoMensal: number;
  potenciaSistema: number;
  quantidadePaineis: number;
  valorTotal: number;
  economiaAnual: number;
  paybackMeses: number;
  garantiaAnos: number;
}

export interface ProposalCommentContext {
  texto: string | null;
  autor: string | null;
  created_at?: string | null;
}

export interface CompanyProfileContext {
  elevator_pitch?: string | null;
  differentials?: string | null;
  installation_process?: string | null;
  warranty_info?: string | null;
  payment_options?: string | null;
}

export interface ObjectionContext {
  question: string;
  response: string;
  priority?: number | null;
}

export interface TestimonialContext {
  display_name?: string | null;
  quote_short?: string | null;
  type?: string | null;
}

export interface PremiumProposalSection {
  section_key?: string;
  key?: string;
  section_title?: string;
  title?: string;
  section_order?: number;
  order?: number;
  content?: Record<string, unknown>;
  source?: 'manual' | 'ai' | 'hybrid' | string;
}

export interface PremiumProposalContent {
  segment: ProposalSegment;
  segmentLabel: string;
  headline: string;
  executiveSummary: string;
  personaFocus: string;
  valuePillars: string[];
  proofPoints: string[];
  objectionHandlers: string[];
  nextStepCta: string;
  assumptions: string[];
  sections?: PremiumProposalSection[];
  variantId?: 'a' | 'b' | 'heuristic';
  variantLabel?: string;
  variantAngle?: string;
  persuasionScore?: number;
  scoreBreakdown?: PersuasionScoreBreakdown;
  generatedBy?: 'heuristic' | 'ai';
  generatedAt?: string;
  generationModel?: string;
}

export interface PersuasionScoreBreakdown {
  clarity: number;
  personalization: number;
  value: number;
  trust: number;
  cta: number;
}

interface BuildPremiumProposalInput {
  contact: Contact;
  clientType?: ClientType | string | null;
  observacoes?: string;
  metrics: ProposalMetrics;
  comments?: ProposalCommentContext[];
  companyProfile?: CompanyProfileContext | null;
  objections?: ObjectionContext[];
  testimonials?: TestimonialContext[];
}

const segmentConfig: Record<
  ProposalSegment,
  { label: string; promise: string; focus: string; cta: string; pillars: string[] }
> = {
  residencial: {
    label: 'Residencial',
    promise: 'reduzir a conta de energia com previsibilidade',
    focus: 'economia mensal e tranquilidade para a família',
    cta: 'Confirmar aprovação e seguir com a validação técnica final do imóvel',
    pillars: ['economia mensal imediata', 'payback claro', 'suporte pós-venda'],
  },
  empresarial: {
    label: 'Empresarial',
    promise: 'transformar energia em ganho de margem e previsibilidade de caixa',
    focus: 'ROI, payback e redução de custo operacional',
    cta: 'Validar aprovação interna e cronograma executivo de implantação',
    pillars: ['ROI competitivo', 'controle de despesas energéticas', 'segurança operacional'],
  },
  agronegocio: {
    label: 'Agronegócio',
    promise: 'garantir energia estável para operação no campo com menor custo',
    focus: 'confiabilidade operacional e autonomia energética',
    cta: 'Confirmar vistoria técnica em campo e plano de implantação',
    pillars: ['continuidade da operação', 'economia recorrente', 'robustez dos equipamentos'],
  },
  usina: {
    label: 'Usina Solar',
    promise: 'estruturar um projeto de geração com visão de longo prazo',
    focus: 'viabilidade econômico-financeira e execução com governança',
    cta: 'Avançar para etapa de viabilidade detalhada e cronograma de execução',
    pillars: ['retorno de longo prazo', 'engenharia robusta', 'governança de implantação'],
  },
  indefinido: {
    label: 'Projeto Solar',
    promise: 'otimizar custo de energia com solução sob medida',
    focus: 'economia, previsibilidade e confiança na execução',
    cta: 'Confirmar aprovação e seguir com a validação técnica final e cronograma do projeto',
    pillars: ['economia', 'previsibilidade', 'segurança na implementação'],
  },
};

const normalizeText = (value?: string | null, maxLen = 320): string => {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.slice(0, maxLen);
};

const clampScore = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
};

const splitListField = (value?: string | null, max = 4): string[] => {
  const cleaned = normalizeText(value, 1400);
  if (!cleaned) return [];
  return cleaned
    .split(/[|;\n]/)
    .map((item) => normalizeText(item, 180))
    .filter(Boolean)
    .slice(0, max);
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const formatPercent = (value: number): string =>
  `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}%`;

const formatYears = (months: number): string => {
  if (!months || months <= 0) return '-';
  const years = months / 12;
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(years)} anos`;
};

const mapClientTypeToSegment = (clientType?: string | null): ProposalSegment => {
  const normalized = String(clientType || '').toLowerCase().trim();
  if (normalized === 'residencial') return 'residencial';
  if (normalized === 'comercial' || normalized === 'industrial') return 'empresarial';
  if (normalized === 'rural') return 'agronegocio';
  if (normalized === 'usina') return 'usina';
  return 'indefinido';
};

const extractSignalsFromComments = (comments: ProposalCommentContext[]): string[] => {
  const joined = comments
    .map((c) => normalizeText(c.texto, 220))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const signals: string[] = [];
  if (!joined) return signals;

  if (/(financi|parcel|juros|entrada|prazo)/.test(joined)) signals.push('interesse em financiamento acessível');
  if (/(garanti|confi|qualidade|marca)/.test(joined)) signals.push('foco em segurança e qualidade dos equipamentos');
  if (/(econom|conta|reduzir custo|payback|retorno)/.test(joined)) signals.push('prioridade em economia e retorno do investimento');
  if (/(prazo|urgent|rápid|rapido|quando instala|instala)/.test(joined)) signals.push('atenção a prazo de implantação');
  if (/(manuten|suporte|assist)/.test(joined)) signals.push('preocupação com manutenção e suporte pós-venda');
  if (/(fazenda|rural|bomba|irrig|ordenha)/.test(joined)) signals.push('necessidade de confiabilidade para operação rural');
  if (/(empresa|indústr|industria|fluxo de caixa|margem)/.test(joined)) signals.push('interesse em impacto financeiro no negócio');

  return signals.slice(0, 3);
};

export function calculatePersuasionScore(content: PremiumProposalContent): {
  score: number;
  breakdown: PersuasionScoreBreakdown;
} {
  const clarity = clampScore(
    55 +
      Math.min(20, Math.floor((content.executiveSummary?.length || 0) / 65)) +
      (content.headline ? 8 : 0)
  );
  const personalization = clampScore(
    45 +
      Math.min(20, content.valuePillars.length * 4) +
      (content.executiveSummary?.includes('cliente') ? 8 : 0)
  );
  const value = clampScore(
    50 +
      Math.min(24, content.valuePillars.length * 4) +
      Math.min(16, content.proofPoints.length * 3)
  );
  const trust = clampScore(
    45 +
      Math.min(20, content.proofPoints.length * 4) +
      Math.min(16, content.assumptions.length * 3)
  );
  const cta = clampScore(40 + (content.nextStepCta ? 35 : 0) + Math.min(18, content.objectionHandlers.length * 6));

  const score = clampScore((clarity + personalization + value + trust + cta) / 5);

  return {
    score,
    breakdown: {
      clarity,
      personalization,
      value,
      trust,
      cta,
    },
  };
}

export function buildPremiumProposalContent(input: BuildPremiumProposalInput): PremiumProposalContent {
  const segment = mapClientTypeToSegment(input.clientType || input.contact.clientType);
  const cfg = segmentConfig[segment];

  const monthlySavings = (input.metrics.economiaAnual || 0) / 12;
  const longTermSavings = (input.metrics.economiaAnual || 0) * 25;
  const roiPercent =
    input.metrics.valorTotal > 0
      ? ((longTermSavings - input.metrics.valorTotal) / input.metrics.valorTotal) * 100
      : 0;

  const companyPitch = normalizeText(input.companyProfile?.elevator_pitch, 220);
  const differentials = splitListField(input.companyProfile?.differentials, 4);
  const warrantyInfo = normalizeText(input.companyProfile?.warranty_info, 180);
  const paymentOptions = normalizeText(input.companyProfile?.payment_options, 200);

  const commentSignals = extractSignalsFromComments(input.comments || []);
  const testimonialBullets = (input.testimonials || [])
    .map((t) => {
      const quote = normalizeText(t.quote_short, 150);
      if (!quote) return '';
      const author = normalizeText(t.display_name, 40) || 'cliente';
      return `${quote} (${author})`;
    })
    .filter(Boolean)
    .slice(0, 2);

  const objectionHandlers = (input.objections || [])
    .sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999))
    .slice(0, 3)
    .map((o) => {
      const question = normalizeText(o.question, 110);
      const answer = normalizeText(o.response, 190);
      return question && answer ? `${question}: ${answer}` : '';
    })
    .filter(Boolean);

  const headline = `${input.contact.name}: ${formatCurrency(monthlySavings)}/mês em economia com retorno estimado em ${formatYears(
    input.metrics.paybackMeses
  )}`;

  const summaryParts = [
    `Projeto ${cfg.label.toLowerCase()} desenhado para ${cfg.promise}.`,
    `Investimento previsto de ${formatCurrency(input.metrics.valorTotal)}, economia anual estimada de ${formatCurrency(
      input.metrics.economiaAnual
    )} e payback em aproximadamente ${formatYears(input.metrics.paybackMeses)}.`,
    `Na janela de 25 anos, o potencial acumulado de economia é de ${formatCurrency(longTermSavings)} (ROI estimado de ${formatPercent(
      roiPercent
    )}).`,
  ];

  if (companyPitch) summaryParts.push(companyPitch);
  const extraNotes = normalizeText(input.observacoes, 180);
  if (extraNotes) summaryParts.push(`Premissas comerciais observadas: ${extraNotes}.`);

  const proofPoints = [
    ...differentials,
    ...testimonialBullets,
    warrantyInfo ? `Garantias e performance: ${warrantyInfo}` : '',
    paymentOptions ? `Condições comerciais: ${paymentOptions}` : '',
  ]
    .filter(Boolean)
    .slice(0, 5);

  const valuePillars = [...cfg.pillars, ...commentSignals].slice(0, 5);

  const assumptions = [
    'Simulação baseada no perfil de consumo informado e histórico de consumo disponível.',
    'Valores sujeitos à vistoria técnica final e confirmação das condições do local.',
    'Dimensionamento alinhado às regras vigentes de geração distribuída (Lei 14.300).',
    'Condições comerciais sujeitas à disponibilidade de equipamentos na data de aprovação.',
  ];

  const base: PremiumProposalContent = {
    segment,
    segmentLabel: cfg.label,
    headline,
    executiveSummary: summaryParts.join(' '),
    personaFocus: cfg.focus,
    valuePillars,
    proofPoints,
    objectionHandlers,
    nextStepCta: cfg.cta,
    assumptions,
    variantId: 'heuristic',
    variantLabel: 'Versão Base',
    variantAngle: 'Personalização por dados reais e melhores práticas comerciais',
    generatedBy: 'heuristic',
    generatedAt: new Date().toISOString(),
  };

  const { score, breakdown } = calculatePersuasionScore(base);
  return {
    ...base,
    persuasionScore: score,
    scoreBreakdown: breakdown,
  };
}
