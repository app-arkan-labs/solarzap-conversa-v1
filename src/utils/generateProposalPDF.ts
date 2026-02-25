import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Contact } from '@/types/solarzap';
import {
  type PremiumProposalContent,
  type EquipmentSpec,
  type NextStepDetailed,
  type EnvironmentalImpact,
} from '@/utils/proposalPersonalization';
import { type ProposalColorTheme, getThemeById } from '@/utils/proposalColorThemes';
import {
  drawSavingsBarChart,
  drawCumulativeSavingsChart,
  drawROIPieChart,
  drawEnvironmentalImpact as drawEnvChart,
  drawMonthlyGenerationChart,
  drawFinancingComparisonChart,
  drawBeforeAfterComparison,
  calcEnvironmentalImpact,
  calcMonthlyGeneration,
  type ChartTheme,
} from '@/utils/proposalCharts';
import solarzapLogo from '@/assets/solarzap-logo.png';

// ══════════════════════════════════════════════════════════
// INTERFACES
// ══════════════════════════════════════════════════════════

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
  premiumContent?: PremiumProposalContent;
  taxaFinanciamento?: number;
  parcela36x?: number;
  parcela60x?: number;
  validadeDias?: number;
  colorTheme?: ProposalColorTheme;
  returnBlob?: boolean;
  propNum?: string;
  logoDataUrl?: string | null;
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
  premiumContent?: PremiumProposalContent;
  taxaFinanciamento?: number;
  parcela36x?: number;
  parcela60x?: number;
  validadeDias?: number;
  returnBlob?: boolean;
  propNum?: string;
  colorTheme?: ProposalColorTheme;
  logoDataUrl?: string | null;
}

// ── Helpers ──────────────────────────────────────────────

import { calcPMT } from '@/utils/financingCalc';

type RGB = [number, number, number];

// ── Tarifa e custo de disponibilidade (ANEEL) ────────────
const TARIFA_MEDIA_KWH = 0.85; // R$/kWh média Brasil com impostos

/** Custo de disponibilidade em kWh por tipo de conexão/cliente (ANEEL REN 1.000/2021) */
function getCustoDisponibilidadeKwh(tipoCliente?: string): number {
  switch (tipoCliente?.toLowerCase()) {
    case 'residencial': return 50;   // bifásico (padrão residencial)
    case 'comercial':   return 100;  // trifásico
    case 'industrial':  return 100;  // trifásico
    case 'rural':       return 30;   // monofásico
    default:            return 50;
  }
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtNumber = (v: number) =>
  new Intl.NumberFormat('pt-BR').format(v);

function fmtYears(months: number): string {
  if (!months || months <= 0) return '-';
  const years = months / 12;
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(years)} anos`;
}

function resolveFinancing(data: { taxaFinanciamento?: number; parcela36x?: number; parcela60x?: number; valorTotal: number }) {
  const has36 = data.parcela36x && data.parcela36x > 0;
  const has60 = data.parcela60x && data.parcela60x > 0;
  const taxa = data.taxaFinanciamento && data.taxaFinanciamento > 0 ? data.taxaFinanciamento : 0;

  const pmt36 = has36 ? data.parcela36x! : taxa > 0 ? calcPMT(taxa, 36, data.valorTotal) : 0;
  const pmt60 = has60 ? data.parcela60x! : taxa > 0 ? calcPMT(taxa, 60, data.valorTotal) : 0;
  const pmt24 = taxa > 0 ? calcPMT(taxa, 24, data.valorTotal) : 0;

  const showFinancing = pmt36 > 0 || pmt60 > 0;
  const isManual = !!(has36 || has60);

  return { pmt24, pmt36, pmt60, taxa, showFinancing, isManual };
}

// ── Theme-aware color palette ────────────────────────────

interface Palette {
  header: RGB; accent: RGB; teal: RGB; lightBg: RGB; cardBg: RGB;
  bodyText: RGB; white: RGB; lightGray: RGB;
  red: RGB; redLight: RGB; redBorder: RGB; warningText: RGB;
  gold: RGB; headerText: RGB;
}

function buildPalette(theme?: ProposalColorTheme | null): Palette {
  const t = theme || getThemeById(null);
  return {
    header: t.primary,
    accent: t.primaryDark,
    teal: t.primary,
    lightBg: t.primaryLight,
    cardBg: [
      Math.min(255, t.primaryLight[0] - 8),
      Math.min(255, t.primaryLight[1] - 8),
      Math.min(255, t.primaryLight[2] - 8),
    ] as RGB,
    bodyText: [70, 84, 103] as RGB,
    white: [255, 255, 255] as RGB,
    lightGray: [222, 227, 235] as RGB,
    red: [220, 38, 38] as RGB,
    redLight: [255, 245, 245] as RGB,
    redBorder: [220, 38, 38] as RGB,
    warningText: [127, 29, 29] as RGB,
    gold: [184, 140, 69] as RGB,
    headerText: t.primaryText,
  };
}

function buildChartTheme(P: Palette): ChartTheme {
  return {
    primary: P.teal,
    primaryDark: P.header,
    primaryLight: P.lightBg,
    accent: P.gold,
    accentAlt: [59, 130, 246] as RGB,
    text: [30, 41, 59] as RGB,
    textLight: [100, 116, 139] as RGB,
    gridLine: P.lightGray,
    white: P.white,
    green: [22, 163, 74] as RGB,
    red: P.red,
    gold: P.gold,
  };
}

// ── Accent sanitisation for Helvetica (standard 14 font — no Unicode glyphs) ──
/** Transliterate common Portuguese/Spanish accented chars so Helvetica can render them. */
function sanitizeForPDF(text: string): string {
  const MAP: Record<string, string> = {
    'À':'A','Á':'A','Â':'A','Ã':'A','Ä':'A','Å':'A',
    'à':'a','á':'a','â':'a','ã':'a','ä':'a','å':'a',
    'È':'E','É':'E','Ê':'E','Ë':'E',
    'è':'e','é':'e','ê':'e','ë':'e',
    'Ì':'I','Í':'I','Î':'I','Ï':'I',
    'ì':'i','í':'i','î':'i','ï':'i',
    'Ò':'O','Ó':'O','Ô':'O','Õ':'O','Ö':'O',
    'ò':'o','ó':'o','ô':'o','õ':'o','ö':'o',
    'Ù':'U','Ú':'U','Û':'U','Ü':'U',
    'ù':'u','ú':'u','û':'u','ü':'u',
    'Ñ':'N','ñ':'n','Ç':'C','ç':'c',
    '\u2013':'-','\u2014':'-','\u2018':"'",'\u2019':"'",
    '\u201C':'"','\u201D':'"','\u2026':'...',
  };
  return text.replace(/[^\x00-\x7F]/g, ch => MAP[ch] ?? ch);
}

// ── AI text sanity check ─────────────────────────────────
/** Returns true if the AI-generated text looks usable (not too short/long/garbled). */
function isSensibleAiText(text: string | undefined | null, label = 'AI text'): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 24 || trimmed.length > 190) {
    console.warn(`[PDF] ${label} rejected (length=${trimmed.length}): "${trimmed.slice(0, 60)}…"`);
    return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════
// CLIENT-FACING PROPOSAL PDF (5+ PAGES)
// ══════════════════════════════════════════════════════════

export function generateProposalPDF(data: ProposalPDFData): Blob | void {
  const doc = new jsPDF();

  // Sprint 10: auto-sanitise all text for Helvetica (no Unicode support)
  const _origText = doc.text.bind(doc);
  doc.text = ((text: any, x: number, y: number, opts?: any) => {
    const clean = typeof text === 'string' ? sanitizeForPDF(text)
      : Array.isArray(text) ? text.map((t: string) => sanitizeForPDF(t))
      : text;
    return _origText(clean, x, y, opts);
  }) as typeof doc.text;

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  let y = 0;

  const C = buildPalette(data.colorTheme);
  const chartTheme = buildChartTheme(C);
  const premium = data.premiumContent;
  const propNum = data.propNum || `PROP-${Date.now().toString().slice(-8)}`;
  const validadeDias = data.validadeDias && data.validadeDias > 0 ? data.validadeDias : 15;
  const econMensal = data.economiaAnual / 12;
  const econAnual = data.economiaAnual;
  const longTermSavings = econAnual * 25;
  const paybackYears = fmtYears(data.paybackMeses);
  const roi25 = data.valorTotal > 0
    ? `${(((longTermSavings - data.valorTotal) / data.valorTotal) * 100).toFixed(1)}%`
    : '-';
  const segLabel = (data.tipo_cliente || 'residencial').charAt(0).toUpperCase() + (data.tipo_cliente || 'residencial').slice(1);
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const logoSrc = data.logoDataUrl || solarzapLogo;

  // ── Derived data (fallbacks if premium doesn't provide) ──
  const envImpact: EnvironmentalImpact = premium?.environmentalImpact
    || calcEnvironmentalImpact(data.consumoMensal * 12, 25);
  const monthlyGen: number[] = premium?.monthlyGeneration
    || calcMonthlyGeneration(data.potenciaSistema);
  const equipSpecs: EquipmentSpec[] = premium?.equipmentSpecs || [
    { item: 'Modulos Fotovoltaicos', spec: 'Monocristalino 550W+ Tier 1', qty: data.quantidadePaineis, warranty: '12 anos produto / 25 anos performance' },
    { item: 'Inversor', spec: 'On-Grid alta eficiencia (>97%)', qty: 1, warranty: '10 anos' },
    { item: 'Estrutura de Fixacao', spec: 'Aluminio anodizado', qty: `${data.quantidadePaineis} conjuntos`, warranty: '15 anos' },
    { item: 'Cabos e Conectores', spec: 'Solar CC 6mm\u00B2 + MC4', qty: 'Kit completo', warranty: '10 anos' },
    { item: 'String Box / Protecao', spec: 'DPS + chave seccionadora CC/CA', qty: 1, warranty: '5 anos' },
  ];
  // Conta mensal real: consumo × tarifa média
  const contaEstimada = data.consumoMensal > 0
    ? data.consumoMensal * TARIFA_MEDIA_KWH
    : econMensal + getCustoDisponibilidadeKwh(data.tipo_cliente) * TARIFA_MEDIA_KWH;
  // Com solar: paga apenas a taxa de disponibilidade (custo mínimo ANEEL)
  const custoDispKwh = getCustoDisponibilidadeKwh(data.tipo_cliente);
  const contaComSolar = Math.min(custoDispKwh * TARIFA_MEDIA_KWH, contaEstimada);
  const termsConditions: string[] = premium?.termsConditions || [
    `Validade: ${validadeDias} dias corridos a partir da data de emissao.`,
    `Valores estimados baseados no consumo de ${fmtNumber(data.consumoMensal)} kWh/mes, sujeitos a vistoria tecnica.`,
    `Dimensionamento conforme Lei 14.300/2022 e resolucoes ANEEL vigentes.`,
    `Economia projetada considera tarifa atual e pode variar com reajustes.`,
    `Garantias conforme fabricante dos equipamentos.`,
    `Instalacao inclui projeto, montagem, comissionamento e solicitacao de vistoria.`,
    `Prazo estimado: 7 a 15 dias uteis apos aprovacao.`,
    `Financiamento sujeito a aprovacao de credito.`,
  ];
  const nextSteps: NextStepDetailed[] = premium?.nextStepsDetailed || [
    { step: 'Aprovacao da Proposta', description: 'Confirmacao dos termos e assinatura.' },
    { step: 'Vistoria Tecnica', description: 'Visita para validacao do local.' },
    { step: 'Projeto Executivo', description: 'Projeto eletrico e registro na concessionaria.' },
    { step: 'Instalacao', description: 'Montagem e comissionamento do sistema.' },
    { step: 'Homologacao', description: 'Vistoria da concessionaria e troca do medidor.' },
    { step: 'Geracao', description: 'Sistema ativo gerando economia!' },
  ];

  const checkPageBreak = (needed: number) => {
    if (y + needed > H - 28) { doc.addPage(); y = 20; return true; }
    return false;
  };

  // ── Gold-underlined section header ──
  const sectionTitle = (title: string) => {
    checkPageBreak(22);
    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(title, M, y);
    y += 3;
    doc.setDrawColor(C.gold[0], C.gold[1], C.gold[2]);
    doc.setLineWidth(1);
    doc.line(M, y, M + 40, y);
    y += 7;
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

  // ── FOOTER helper ──
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

  // ── Compact page header for pages 2+ ──
  const drawCompactHeader = (sub: string): number => {
    const h2H = 28;
    doc.setFillColor(C.header[0], C.header[1], C.header[2]);
    doc.rect(0, 0, W, h2H, 'F');
    doc.setFillColor(C.gold[0], C.gold[1], C.gold[2]);
    doc.rect(0, h2H, W, 2, 'F');
    try { doc.addImage(logoSrc, 'PNG', M, 4, 16, 16); } catch {
      // Logo fallback: render text instead of blank space
      doc.setTextColor(255, 255, 255); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
      doc.text('SOLARZAP', M + 1, 13);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text('Proposta Comercial de Energia Solar', M + 22, 12);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(sub, M + 22, 20);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
    doc.text(`${propNum}`, W - M, 12, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(today, W - M, 20, { align: 'right' });
    doc.setFillColor(C.teal[0], C.teal[1], C.teal[2]);
    const bW = doc.getTextWidth(segLabel) + 10;
    doc.roundedRect(W - M - bW, h2H + 5, bW, 7, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(segLabel, W - M - bW + 5, h2H + 10);
    return h2H + 18;
  };

  // ════════════════════════════════════════════
  // PAGE 1 — COVER / OVERVIEW
  // ════════════════════════════════════════════

  const headerH = 52;
  doc.setFillColor(C.header[0], C.header[1], C.header[2]);
  doc.rect(0, 0, W, headerH, 'F');
  doc.setFillColor(C.gold[0], C.gold[1], C.gold[2]);
  doc.rect(0, headerH, W, 3, 'F');

  try { doc.addImage(logoSrc, 'PNG', M, 6, 24, 24); } catch {
    // Logo fallback: render text instead of blank space (Sprint 3)
    doc.setFillColor(255, 255, 255); doc.roundedRect(M, 6, 24, 24, 2, 2, 'F');
    doc.setTextColor(C.header[0], C.header[1], C.header[2]); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('SOLAR', M + 3, 17); doc.text('ZAP', M + 6, 23);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('Proposta Comercial de Energia Solar', M + 30, 18);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  const coverSub = premium?.personaFocus
    ? `${segLabel} | ${premium.personaFocus}`
    : `${segLabel} | Ideal para quem busca economia imediata e retorno financeiro em curto prazo.`;
  const subLines = doc.splitTextToSize(coverSub, W - M - 30 - M);
  doc.text(subLines, M + 30, 28);

  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text(`Proposta ${propNum}`, W - M, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(today, W - M, 24, { align: 'right' });

  doc.setFillColor(C.teal[0], C.teal[1], C.teal[2]);
  const badgeW = doc.getTextWidth(segLabel) + 10;
  doc.roundedRect(W - M - badgeW, 34, badgeW, 8, 2, 2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
  doc.text(segLabel, W - M - badgeW + 5, 39.5);

  y = headerH + 10;

  // ── DADOS DA PROPOSTA (card) ──
  const cardH = 30;
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
  doc.text(`Segmento: ${segLabel}`, rightCol, y + 16);
  doc.text(`Tipo: ${(data.tipo_cliente || 'residencial').toLowerCase()}`, rightCol, y + 22);
  doc.text(`Validade: ${validadeDias} dias`, rightCol, y + 28);

  y += cardH + 8;

  // ── THREE METRIC CARDS ──
  const cardWidth = (W - 2 * M - 8) / 3;
  const metricH = 20;
  const metricsArr = [
    { label: 'INVESTIMENTO ESTIMADO', value: fmtCurrency(data.valorTotal) },
    { label: 'ECONOMIA MENSAL ESTIMADA', value: fmtCurrency(econMensal) },
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

  // ── "Quanto custa e quanto economiza" ──
  sectionTitle('Quanto custa e quanto economiza');

  if (premium?.headline && isSensibleAiText(premium.headline, 'headline')) {
    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
    const hlLines = doc.splitTextToSize(premium.headline, W - 2 * M);
    doc.text(hlLines, M, y);
    y += hlLines.length * 4.5 + 4;
  }

  const narrative = `${fmtCurrency(data.valorTotal)} de investimento estimado para economizar cerca de ${fmtCurrency(econMensal)}/mes (${fmtCurrency(econAnual)}/ano), com payback aproximado de ${paybackYears}. Economia acumulada em 25 anos: ${fmtCurrency(longTermSavings)} (simulacao).`;
  doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
  doc.setFontSize(9.6); doc.setFont('helvetica', 'normal');
  const narLines = doc.splitTextToSize(narrative, W - 2 * M);
  doc.text(narLines, M, y);
  y += narLines.length * 4.5 + 6;

  // ── "Objetivo do Projeto" ──
  if (premium?.executiveSummary) {
    sectionTitle('Objetivo do Projeto');
    doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
    if (premium.personaFocus) {
      doc.text(premium.personaFocus, M, y);
      y += 6;
    }
    const sumLines = doc.splitTextToSize(premium.executiveSummary, W - 2 * M);
    doc.text(sumLines, M, y);
    y += sumLines.length * 4.5 + 6;
  }

  // ── "Beneficios principais" ──
  if (premium?.valuePillars && premium.valuePillars.length > 0) {
    sectionTitle('Beneficios principais');
    premium.valuePillars.forEach((p) => {
      bullet(p.charAt(0).toUpperCase() + p.slice(1), C.teal);
    });
    y += 2;
  }

  // ── "Por que confiar" ──
  const trustItems = [
    ...(premium?.proofPoints || []),
    `Garantia contratual de ${data.garantiaAnos} anos (equipamentos e performance).`,
    'Dimensionamento alinhado ao consumo informado e as regras vigentes de geracao distribuida.',
  ];
  sectionTitle('Por que confiar');
  trustItems.slice(0, 5).forEach((pt) => {
    bullet(pt, C.gold);
  });

  // ════════════════════════════════════════════
  // PAGE 2 — ANÁLISE DE ECONOMIA + GRÁFICOS
  // ════════════════════════════════════════════
  doc.addPage();
  y = drawCompactHeader('Analise de Economia e Retorno');

  // Before/After comparison table
  sectionTitle('Comparativo: Sem Solar vs Com Solar');
  const baData = {
    contaAtual: contaEstimada,
    contaComSolar,
    economiaMensal: econMensal,
    econAnual,
    custo25AnosSem: contaEstimada * 12 * 25,
    custo25AnosCom: contaComSolar * 12 * 25 + data.valorTotal,
  };
  const baH = drawBeforeAfterComparison(doc, M, y, W - 2 * M, baData, chartTheme);
  y += baH + 8;

  // Two charts side by side
  checkPageBreak(62);
  const chartRowW = (W - 2 * M - 6) / 2;
  drawSavingsBarChart(doc, M, y, chartRowW, 58, {
    contaAtual: contaEstimada,
    contaComSolar,
    economiaMensal: econMensal,
  }, chartTheme);

  drawROIPieChart(doc, M + chartRowW + 6, y, chartRowW, 58, {
    valorTotal: data.valorTotal,
    retornoLiquido: longTermSavings - data.valorTotal,
  }, chartTheme);
  y += 64;

  // Cumulative savings chart (full width)
  checkPageBreak(65);
  drawCumulativeSavingsChart(doc, M, y, W - 2 * M, 60, {
    valorTotal: data.valorTotal,
    economiaMensal: econMensal,
    paybackMeses: data.paybackMeses,
  }, chartTheme);
  y += 66;

  // Summary text
  if (y + 20 < H - 28) {
    doc.setTextColor(C.header[0], C.header[1], C.header[2]);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    const retPerReal = data.valorTotal > 0 ? (longTermSavings / data.valorTotal).toFixed(1) : '-';
    doc.text(
      `Para cada R$ 1,00 investido, voce recupera R$ ${retPerReal} ao longo de 25 anos.`,
      W / 2, y, { align: 'center' }
    );
    y += 8;
  }

  // ════════════════════════════════════════════
  // PAGE 3 — TÉCNICO + EQUIPAMENTOS + AMBIENTAL
  // ════════════════════════════════════════════
  doc.addPage();
  y = drawCompactHeader('Dimensionamento Tecnico e Equipamentos');

  sectionTitle('Dimensionamento do Sistema');
  autoTable(doc, {
    startY: y,
    head: [['Especificacao', 'Valor']],
    body: [
      ['Consumo Medio Mensal', `${fmtNumber(data.consumoMensal)} kWh/mes`],
      ['Potencia do Sistema', `${data.potenciaSistema.toFixed(2)} kWp`],
      ['Quantidade de Paineis', `${data.quantidadePaineis} modulos`],
      ['Geracao Mensal Estimada', `${fmtNumber(Math.round(monthlyGen.reduce((a, b) => a + b, 0) / 12))} kWh/mes`],
      ['Geracao Anual Estimada', `${fmtNumber(monthlyGen.reduce((a, b) => a + b, 0))} kWh/ano`],
      ['Garantia do Sistema', `${data.garantiaAnos} anos`],
    ],
    theme: 'striped',
    headStyles: { fillColor: C.header, textColor: 255, fontStyle: 'bold', fontSize: 9.5 },
    alternateRowStyles: { fillColor: C.lightBg },
    margin: { left: M, right: M },
    styles: { fontSize: 9.5, cellPadding: 4, textColor: C.bodyText },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Equipment Specs Table
  sectionTitle('Equipamentos');
  autoTable(doc, {
    startY: y,
    head: [['Item', 'Especificacao', 'Qtd.', 'Garantia']],
    body: equipSpecs.map((e) => [e.item, e.spec, String(e.qty), e.warranty]),
    theme: 'striped',
    headStyles: { fillColor: C.header, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: C.lightBg },
    margin: { left: M, right: M },
    styles: { fontSize: 8.5, cellPadding: 3.5, textColor: C.bodyText },
    columnStyles: { 0: { cellWidth: 42 }, 2: { cellWidth: 22, halign: 'center' as const }, 3: { cellWidth: 45 } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Monthly Generation Chart
  checkPageBreak(55);
  drawMonthlyGenerationChart(doc, M, y, W - 2 * M, 50, monthlyGen, chartTheme);
  y += 56;

  // Environmental Impact Infographic
  checkPageBreak(60);
  drawEnvChart(doc, M, y, W - 2 * M, 56, envImpact, chartTheme);
  y += 62;

  // ════════════════════════════════════════════
  // PAGE 4 — FINANCEIRO + FINANCIAMENTO
  // ════════════════════════════════════════════
  doc.addPage();
  y = drawCompactHeader('Analise Financeira e Financiamento');

  sectionTitle('Analise Financeira Detalhada');
  autoTable(doc, {
    startY: y,
    head: [['Descricao', 'Valor']],
    body: [
      ['Investimento Total', fmtCurrency(data.valorTotal)],
      ['Economia Mensal Estimada', fmtCurrency(econMensal)],
      ['Economia Anual Estimada', fmtCurrency(econAnual)],
      ['Tempo de Retorno (Payback)', paybackYears],
      ['Economia em 25 anos', fmtCurrency(longTermSavings)],
      ['ROI em 25 anos', roi25],
      ['CO\u2082 evitado em 25 anos', `${envImpact.co2Tons} toneladas`],
    ],
    theme: 'striped',
    headStyles: { fillColor: C.header, textColor: 255, fontStyle: 'bold', fontSize: 9.5 },
    alternateRowStyles: { fillColor: C.lightBg },
    margin: { left: M, right: M },
    styles: { fontSize: 9.5, cellPadding: 4, textColor: C.bodyText },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Financing Simulation
  const fin = resolveFinancing(data);
  if (fin.showFinancing && data.valorTotal > 0) {
    sectionTitle('Simulacao de Financiamento');
    const finBody: string[][] = [];
    if (fin.pmt24 > 0) finBody.push(['24 meses', fmtCurrency(fin.pmt24), fmtCurrency(fin.pmt24 * 24), fmtCurrency(econMensal), fin.pmt24 <= econMensal ? 'Parcela < Economia' : '']);
    if (fin.pmt36 > 0) finBody.push(['36 meses', fmtCurrency(fin.pmt36), fmtCurrency(fin.pmt36 * 36), fmtCurrency(econMensal), fin.pmt36 <= econMensal ? 'Parcela < Economia' : '']);
    if (fin.pmt60 > 0) finBody.push(['60 meses', fmtCurrency(fin.pmt60), fmtCurrency(fin.pmt60 * 60), fmtCurrency(econMensal), fin.pmt60 <= econMensal ? 'Parcela < Economia' : '']);
    autoTable(doc, {
      startY: y,
      head: [['Prazo', 'Parcela Mensal', 'Total', 'Economia Mensal', 'Status']],
      body: finBody,
      theme: 'striped',
      headStyles: { fillColor: C.header, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: C.lightBg },
      margin: { left: M, right: M },
      styles: { fontSize: 9, cellPadding: 4, textColor: C.bodyText },
      didParseCell: (hookData: any) => {
        if (hookData.section === 'body' && hookData.column.index === 4 && hookData.cell.raw === 'Parcela < Economia') {
          hookData.cell.styles.textColor = [22, 163, 74];
          hookData.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
    doc.setTextColor(130, 130, 130); doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
    const note = fin.isManual
      ? 'Parcelas informadas pelo vendedor. Valores dependem da analise de credito e taxas do banco.'
      : `Taxa: ${fin.taxa.toFixed(2)}% a.m. | Simulacao ilustrativa, sujeita a analise de credito.`;
    doc.text(note, M, y + 3);
    y += 10;

    // Financing comparison chart
    checkPageBreak(55);
    drawFinancingComparisonChart(doc, M, y, W - 2 * M, 48, {
      parcela36: fin.pmt36,
      parcela60: fin.pmt60,
      economiaMensal: econMensal,
    }, chartTheme);
    y += 54;
  } else if (data.valorTotal > 0) {
    sectionTitle('Financiamento');
    doc.setTextColor(100, 100, 100); doc.setFontSize(9.5);
    doc.text('Financiamento sob consulta. Entre em contato para simular as condicoes.', M, y);
    y += 10;
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
    doc.text(obs, M, y); y += obs.length * 4.5 + 6;
  }

  // ════════════════════════════════════════════
  // PAGE 5 — TERMOS, PRÓXIMOS PASSOS, CTA
  // ════════════════════════════════════════════
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
    const ctaText = premium?.nextStepCta || `Entre em contato conosco para dar o proximo passo rumo a economia com energia solar. Estamos prontos para tirar todas as suas duvidas!`;
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
    y += ctaBoxH + 6;
  }

  // ── FOOTER on all pages ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    drawFooter(i, pages);
  }

  const fileName = `Proposta_Energia_Solar_${data.contact.name.replace(/\s+/g, '_')}_${propNum}.pdf`;
  if (data.returnBlob) return doc.output('blob');
  doc.save(fileName);
}


// ══════════════════════════════════════════════════════════
// SELLER SCRIPT PDF (internal — NOT for client)
// ══════════════════════════════════════════════════════════

export function generateSellerScriptPDF(data: SellerScriptPDFData): Blob | void {
  const doc = new jsPDF();

  // Sprint 10: auto-sanitise all text for Helvetica (no Unicode support)
  const _origText2 = doc.text.bind(doc);
  doc.text = ((text: any, x: number, y: number, opts?: any) => {
    const clean = typeof text === 'string' ? sanitizeForPDF(text)
      : Array.isArray(text) ? text.map((t: string) => sanitizeForPDF(t))
      : text;
    return _origText2(clean, x, y, opts);
  }) as typeof doc.text;

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  let y = 0;

  const C = buildPalette(data.colorTheme);
  const logoSrc = data.logoDataUrl || solarzapLogo;
  const premium = data.premiumContent;
  const propNum = data.propNum || `PROP-${Date.now().toString().slice(-8)}`;
  const validadeDias = data.validadeDias && data.validadeDias > 0 ? data.validadeDias : 15;
  const segLabel = (data.tipo_cliente || 'indefinido').charAt(0).toUpperCase() + (data.tipo_cliente || 'indefinido').slice(1);
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const econMensal = data.economiaAnual / 12;
  const econAnual = data.economiaAnual;
  const longTermSavings = econAnual * 25;
  const paybackYears = fmtYears(data.paybackMeses);
  const roi25 = data.valorTotal > 0
    ? `${(((longTermSavings - data.valorTotal) / data.valorTotal) * 100).toFixed(1)}%`
    : '-';
  const fin = resolveFinancing(data);
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

  // ════════════════════════════════════════════
  // PAGE 1
  // ════════════════════════════════════════════
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
    doc.addImage(logoSrc, 'PNG', M, 5, 18, 18);
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
      ['Garantia (referencia)', `${data.garantiaAnos} anos`],
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

  // ════════════════════════════════════════════
  // PAGE 2
  // ════════════════════════════════════════════
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
    if (fin.taxa > 0) { doc.text(`Taxa: ${fin.taxa.toFixed(2)}% a.m.`, M + 4, y); y += 5.5; }
    if (fin.pmt36 > 0) { doc.text(`36x de ${fmtCurrency(fin.pmt36)} (total: ${fmtCurrency(fin.pmt36 * 36)})`, M + 4, y); y += 5.5; }
    if (fin.pmt60 > 0) { doc.text(`60x de ${fmtCurrency(fin.pmt60)} (total: ${fmtCurrency(fin.pmt60 * 60)})`, M + 4, y); y += 5.5; }
    doc.setFont('helvetica', 'bold'); doc.setTextColor(C.teal[0], C.teal[1], C.teal[2]);
    if (fin.pmt60 > 0 && econMensal > fin.pmt60) {
      doc.text(`Parcela 60x (${fmtCurrency(fin.pmt60)}) < economia mensal (${fmtCurrency(econMensal)})! Use isso!`, M + 4, y);
    } else {
      doc.text(`Economia mensal: ${fmtCurrency(econMensal)} - compare com a parcela.`, M + 4, y);
    }
    doc.setFont('helvetica', 'normal'); doc.setTextColor(C.bodyText[0], C.bodyText[1], C.bodyText[2]);
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
