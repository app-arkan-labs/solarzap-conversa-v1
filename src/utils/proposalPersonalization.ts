import { ClientType, Contact } from '@/types/solarzap';
import {
  PAYMENT_CONDITION_LABEL_BY_ID,
  type FinancingCondition,
  type PaymentConditionOptionId,
} from '@/types/proposalFinancing';

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

export interface BantQualificationRow {
  item: string;
  status: string;
  question: string;
}

export interface EquipmentSpec {
  item: string;
  spec: string;
  qty: number | string;
  warranty: string;
}

export interface EnvironmentalImpact {
  co2Tons: number;
  trees: number;
  carKm: number;
}

export interface BeforeAfterRow {
  label: string;
  before: string;
  after: string;
}

export interface NextStepDetailed {
  step: string;
  description: string;
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
  visitSteps?: string[];
  bantQualification?: BantQualificationRow[];
  sections?: PremiumProposalSection[];
  variantId?: 'a' | 'b' | 'heuristic';
  variantLabel?: string;
  variantAngle?: string;
  persuasionScore?: number;
  scoreBreakdown?: PersuasionScoreBreakdown;
  generatedBy?: 'heuristic' | 'ai';
  generatedAt?: string;
  generationModel?: string;
  // ── Premium V2 fields ──
  environmentalImpact?: EnvironmentalImpact;
  monthlyGeneration?: number[];
  equipmentSpecs?: EquipmentSpec[];
  beforeAfter?: BeforeAfterRow[];
  termsConditions?: string[];
  nextStepsDetailed?: NextStepDetailed[];
  companyContact?: { name?: string; phone?: string; email?: string; address?: string };
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
  taxaFinanciamento?: number;
  parcela36x?: number;
  parcela60x?: number;
  paymentConditions?: PaymentConditionOptionId[];
  financingConditions?: FinancingCondition[];
}

const segmentConfig: Record<
  ProposalSegment,
  { label: string; promise: string; focus: string; cta: string; pillars: string[]; visitSteps: string[] }
> = {
  residencial: {
    label: 'Residencial',
    promise: 'reduzir a conta de energia com previsibilidade',
    focus: 'economia mensal e tranquilidade para a família',
    cta: 'Confirmar aprovação e seguir com a validação técnica final do imóvel',
    pillars: ['economia mensal imediata', 'payback claro', 'suporte pós-venda'],
    visitSteps: [
      'Confirme consumo/conta e o que o cliente quer melhorar (economia, previsibilidade, conforto).',
      'Valide os pontos técnicos essenciais (telhado, sombras, padrão de entrada, local do inversor).',
      'Mostre os números (investimento, economia, payback) de forma simples e direta.',
      'Reforce confiança (garantias, pós-venda e casos reais).',
      'Combine a condição de pagamento (à vista ou financiamento).',
    ],
  },
  empresarial: {
    label: 'Empresarial',
    promise: 'transformar energia em ganho de margem e previsibilidade de caixa',
    focus: 'ROI, payback e redução de custo operacional',
    cta: 'Validar aprovação interna e cronograma executivo de implantação',
    pillars: ['ROI competitivo', 'controle de despesas energéticas', 'segurança operacional'],
    visitSteps: [
      'Confirme o perfil de consumo e os objetivos do negócio (redução de custo, margem, previsibilidade).',
      'Valide os pontos técnicos (cobertura, área útil, padrão elétrico, demanda contratada).',
      'Apresente os números-chave (investimento, ROI, payback, economia anual).',
      'Reforce confiança (garantias contratuais, cases e referências de clientes PJ).',
      'Combine condição de pagamento e cronograma de implantação.',
    ],
  },
  agronegocio: {
    label: 'Agronegócio',
    promise: 'garantir energia estável para operação no campo com menor custo',
    focus: 'confiabilidade operacional e autonomia energética',
    cta: 'Confirmar vistoria técnica em campo e plano de implantação',
    pillars: ['continuidade da operação', 'economia recorrente', 'robustez dos equipamentos'],
    visitSteps: [
      'Confirme o consumo (bombas, irrigação, ordenha) e as necessidades operacionais.',
      'Valide os pontos técnicos (local de instalação, distância do padrão, sombreamento).',
      'Apresente os números (investimento, economia, payback) e compare com o custo atual.',
      'Reforce robustez e confiabilidade (garantias, durabilidade dos equipamentos).',
      'Combine condição de pagamento e cronograma de vistoria em campo.',
    ],
  },
  usina: {
    label: 'Usina Solar',
    promise: 'estruturar um projeto de geração com visão de longo prazo',
    focus: 'viabilidade econômico-financeira e execução com governança',
    cta: 'Avançar para etapa de viabilidade detalhada e cronograma de execução',
    pillars: ['retorno de longo prazo', 'engenharia robusta', 'governança de implantação'],
    visitSteps: [
      'Confirme o escopo do projeto e expectativa de geração (kWp, área, conexão).',
      'Valide os pontos técnicos (terreno, rede de distribuição, licenciamento).',
      'Apresente viabilidade financeira (investimento, TIR, VPL, payback).',
      'Reforce governança (engenharia, cronograma, marcos contratuais).',
      'Alinhe próximos passos (estudo de viabilidade detalhado e cronograma).',
    ],
  },
  indefinido: {
    label: 'Projeto Solar',
    promise: 'otimizar custo de energia com solução sob medida',
    focus: 'economia, previsibilidade e confiança na execução',
    cta: 'Confirmar aprovação e seguir com a validação técnica final e cronograma do projeto',
    pillars: ['economia', 'previsibilidade', 'segurança na implementação'],
    visitSteps: [
      'Confirme consumo/conta e o que o cliente quer melhorar (economia, previsibilidade).',
      'Valide os pontos técnicos essenciais (telhado, sombras, padrão de entrada, local do inversor).',
      'Mostre os números (investimento, economia, payback) de forma simples e direta.',
      'Reforce confiança (garantias, pós-venda e referências).',
      'Combine a condição de pagamento (à vista ou financiamento).',
    ],
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

  const isUsina = segment === 'usina';

  const headline = isUsina
    ? `${input.contact.name}: ${formatCurrency(monthlySavings)}/mês em receita estimada com retorno em ${formatYears(input.metrics.paybackMeses)}`
    : `${input.contact.name}: ${formatCurrency(monthlySavings)}/mês em economia com retorno estimado em ${formatYears(input.metrics.paybackMeses)}`;

  const summaryParts = [
    `Projeto ${cfg.label.toLowerCase()} desenhado para ${cfg.promise}.`,
    isUsina
      ? `Investimento previsto de ${formatCurrency(input.metrics.valorTotal)}, receita anual estimada de ${formatCurrency(input.metrics.economiaAnual)} e payback em aproximadamente ${formatYears(input.metrics.paybackMeses)}.`
      : `Investimento previsto de ${formatCurrency(input.metrics.valorTotal)}, economia anual estimada de ${formatCurrency(input.metrics.economiaAnual)} e payback em aproximadamente ${formatYears(input.metrics.paybackMeses)}.`,
    isUsina
      ? `Na janela de 25 anos, a receita acumulada estimada é de ${formatCurrency(longTermSavings)} (ROI estimado de ${formatPercent(roiPercent)}).`
      : `Na janela de 25 anos, o potencial acumulado de economia é de ${formatCurrency(longTermSavings)} (ROI estimado de ${formatPercent(roiPercent)}).`,
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
    isUsina
      ? 'Simulação baseada na capacidade de geração e potência instalada do projeto.'
      : 'Simulação baseada no perfil de consumo informado e histórico de consumo disponível.',
    'Valores sujeitos à vistoria técnica final e confirmação das condições do local.',
    'Dimensionamento alinhado às regras vigentes de geração distribuída (Lei 14.300).',
    'Condições comerciais sujeitas à disponibilidade de equipamentos na data de aprovação.',
  ];

  // Visit steps: segment-specific + closing step with CTA
  const visitSteps = [
    ...cfg.visitSteps,
    `No final, peca a decisao do que fazer agora (${cfg.cta})`,
  ];

  // BANT qualification rows
  const taxa = input.taxaFinanciamento && input.taxaFinanciamento > 0 ? input.taxaFinanciamento : 1.5;
  const pmt36 = input.parcela36x && input.parcela36x > 0
    ? input.parcela36x
    : input.metrics.valorTotal > 0
      ? (input.metrics.valorTotal * (taxa / 100) * Math.pow(1 + taxa / 100, 36)) / (Math.pow(1 + taxa / 100, 36) - 1)
      : 0;

  const bantQualification: BantQualificationRow[] = [
    {
      item: 'Orcamento',
      status: `Investimento estimado: ${formatCurrency(input.metrics.valorTotal)}`,
      question: pmt36 > 0
        ? `Se a parcela de 36x (${formatCurrency(pmt36)}/mes) ficar proxima/abaixo da conta atual, faz sentido avancar?`
        : 'O investimento esta dentro do orcamento previsto?',
    },
    {
      item: 'Decisor',
      status: 'A confirmar na visita',
      question: 'Quem mais participa da decisao? Precisamos incluir alguem na conversa?',
    },
    {
      item: 'Motivo',
      status: cfg.focus,
      question: 'Qual o principal motivo para considerar energia solar agora?',
    },
    {
      item: 'Prazo',
      status: 'A confirmar',
      question: 'Tem alguma data ou urgencia para a instalacao?',
    },
  ];

  // ── Environmental Impact ──
  const econAnualKwh = (input.metrics.consumoMensal || 0) * 12;
  const totalKwh25 = econAnualKwh * 25;
  const co2Tons = Math.round(((totalKwh25 / 1000) * 0.0817) * 10) / 10;
  const trees = Math.round((co2Tons * 1000) / (22 * 25));
  const carKm = Math.round((co2Tons * 1000) / 2.3 * 12);
  const environmentalImpact: EnvironmentalImpact = { co2Tons, trees, carKm };

  // ── Monthly Generation Estimate ──
  // Use consumoMensal (the user's actual generation/consumption input) as the average,
  // then vary by seasonal irradiation factors
  const monthFactors = [1.19, 1.16, 1.09, 0.96, 0.79, 0.71, 0.75, 0.89, 0.97, 1.08, 1.17, 1.24];
  const monthlyGeneration = monthFactors.map(
    (f) => Math.round(input.metrics.consumoMensal * f)
  );

  // ── Equipment Specs (defaults — overridden by AI or user input when available) ──
  const equipmentSpecs: EquipmentSpec[] = [
    { item: 'Modulos Fotovoltaicos', spec: 'Monocristalino 550W+ Tier 1', qty: input.metrics.quantidadePaineis, warranty: '12 anos produto / 25 anos performance' },
    { item: 'Inversor', spec: isUsina ? 'Inversor Central / String alta eficiencia' : 'On-Grid alta eficiencia (>97%)', qty: 1, warranty: '10 anos' },
    { item: 'Estrutura de Fixacao', spec: isUsina ? 'Estrutura de solo (Tracker ou Fixa)' : 'Aluminio anodizado com perfil trilho', qty: `${input.metrics.quantidadePaineis} conjuntos`, warranty: '15 anos contra corrosao' },
    { item: 'Cabos e Conectores', spec: 'Solar CC 6mm² + MC4', qty: 'Kit completo', warranty: '10 anos' },
    { item: 'String Box / Protecao', spec: 'DPS + chave seccionadora CC/CA', qty: 1, warranty: '5 anos' },
  ];

  // ── Before/After Comparison ──
  const contaAtual = monthlySavings * 1.15; // estimate: savings ≈ 87% of bill
  const contaComSolar = contaAtual - monthlySavings;
  const custo25SemSolar = contaAtual * 12 * 25;
  const custo25ComSolar = contaComSolar * 12 * 25 + input.metrics.valorTotal;
  const beforeAfter: BeforeAfterRow[] = [
    { label: isUsina ? 'Custo oportunidade mensal' : 'Conta mensal', before: formatCurrency(contaAtual), after: formatCurrency(contaComSolar) },
    { label: isUsina ? 'Custo oportunidade anual' : 'Custo anual com energia', before: formatCurrency(contaAtual * 12), after: formatCurrency(contaComSolar * 12) },
    { label: isUsina ? 'Custo oportunidade (25 anos)' : 'Gasto em 25 anos', before: formatCurrency(custo25SemSolar), after: formatCurrency(custo25ComSolar) },
    { label: isUsina ? 'Receita mensal' : 'Economia mensal', before: '-', after: formatCurrency(monthlySavings) },
    { label: isUsina ? 'Receita acumulada (25 anos)' : 'Economia acumulada (25 anos)', before: '-', after: formatCurrency(longTermSavings) },
  ];

  // ── Terms & Conditions ──
  const paymentLabels = Array.from(new Set((input.paymentConditions || []).map((id) => PAYMENT_CONDITION_LABEL_BY_ID[id] || id)));
  const hasFinancing = (input.paymentConditions || []).includes('financiamento_bancario');
  const termsConditions = [
    `Validade desta proposta: 15 dias corridos a partir da data de emissao.`,
    isUsina
      ? `Os valores apresentados sao estimativas baseadas na potencia projetada de ${input.metrics.potenciaSistema} kWp e estao sujeitos a vistoria tecnica.`
      : `Os valores apresentados sao estimativas baseadas no consumo informado de ${input.metrics.consumoMensal} kWh/mes e estao sujeitos a vistoria tecnica.`,
    `O dimensionamento segue as normas da ANEEL e da Lei 14.300/2022 (geracao distribuida).`,
    isUsina
      ? `A receita projetada considera a tarifa vigente ou mercado livre e pode variar conforme reajustes tarifarios/contratos.`
      : `A economia projetada considera a tarifa vigente e pode variar conforme reajustes tarifarios.`,
    `Garantia dos equipamentos conforme fabricante: modulos (12 anos produto / 25 anos performance linear), inversor (conforme marca selecionada).`,
    `A instalacao inclui: projeto eletrico, instalacao mecanica e eletrica, comissionamento e solicitacao de vistoria junto a concessionaria.`,
    `Prazo estimado de instalacao: 7 a 15 dias uteis apos aprovacao do projeto e disponibilidade de materiais.`,
    paymentLabels.length > 0
      ? `Condicoes de pagamento selecionadas: ${paymentLabels.join(', ')}.`
      : 'Condicoes de pagamento sob consulta comercial.',
    hasFinancing
      ? 'Financiamento bancario (quando selecionado) esta sujeito a aprovacao de credito pela instituicao financeira.'
      : 'Nao ha simulacao de financiamento vinculada nesta proposta, salvo negociacao comercial posterior.',
  ];

  // ── Next Steps Detailed ──
  const nextStepsDetailed: NextStepDetailed[] = [
    { step: 'Aprovacao da Proposta', description: 'Confirmacao dos termos comerciais e assinatura do contrato.' },
    { step: isUsina ? 'Estudo de Viabilidade' : 'Vistoria Tecnica', description: isUsina ? 'Levantamento topografico, analise de solo e conexao com a rede.' : 'Visita ao local para validacao das condicoes do telhado, rede eletrica e dimensionamento final.' },
    { step: 'Projeto Executivo', description: 'Elaboracao do projeto eletrico e registro junto a concessionaria de energia.' },
    { step: 'Instalacao', description: 'Montagem dos equipamentos, conexao eletrica e comissionamento do sistema.' },
    { step: 'Homologacao', description: 'Solicitacao de vistoria pela concessionaria e troca do medidor para bidirecional.' },
    { step: 'Geracao de Energia', description: 'Sistema ativo e gerando economia a partir da aprovacao da concessionaria.' },
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
    visitSteps,
    bantQualification,
    variantId: 'heuristic',
    variantLabel: 'Versão Base',
    variantAngle: 'Personalização por dados reais e melhores práticas comerciais',
    generatedBy: 'heuristic',
    generatedAt: new Date().toISOString(),
    environmentalImpact,
    monthlyGeneration,
    equipmentSpecs,
    beforeAfter,
    termsConditions,
    nextStepsDetailed,
  };

  const { score, breakdown } = calculatePersuasionScore(base);
  return {
    ...base,
    persuasionScore: score,
    scoreBreakdown: breakdown,
  };
}
