import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Contact } from '@/types/solarzap';
import { PremiumProposalContent } from '@/utils/proposalPersonalization';
import solarzapLogo from '@/assets/solarzap-logo.png';

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
  validadeDias?: number;
  returnBlob?: boolean;
}

// ── PMT ──
function calcPMT(rate: number, nper: number, pv: number): number {
  if (rate === 0) return pv / nper;
  const r = rate / 100;
  return (pv * r * Math.pow(1 + r, nper)) / (Math.pow(1 + r, nper) - 1);
}

const fmtCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtNumber = (v: number) => new Intl.NumberFormat('pt-BR').format(v);

// ══════════════════════════════════════════════════════════
// CLIENT-FACING PROPOSAL PDF
// No internal jargon, no scores, no breakdown
// ══════════════════════════════════════════════════════════
export function generateProposalPDF(data: ProposalPDFData): Blob | void {
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 20;
  let y = 0;
  const premium = data.premiumContent;
  const propNum = `PROP-${Date.now().toString().slice(-8)}`;

  const checkPageBreak = (needed: number) => {
    if (y + needed > H - 35) { doc.addPage(); y = 25; return true; }
    return false;
  };

  const sectionHeader = (title: string) => {
    checkPageBreak(25);
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(M, y, W - 2 * M, 12, 2, 2, 'F');
    doc.setTextColor(22, 101, 52);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(title, M + 6, y + 8.5);
    y += 18;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
  };

  // ── HEADER ──
  doc.setFillColor(22, 163, 74);
  doc.rect(0, 0, W, 52, 'F');
  doc.setFillColor(21, 128, 61);
  doc.rect(0, 48, W, 4, 'F');

  try { doc.addImage(solarzapLogo, 'PNG', M, 6, 38, 38); } catch { /* text fallback */ }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.text('SolarZap', M + 44, 24);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Proposta Comercial — Energia Solar', M + 44, 36);

  doc.setFontSize(9);
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(propNum, W - M, 24, { align: 'right' });
  doc.text(today, W - M, 33, { align: 'right' });

  y = 64;

  // ── HEADLINE (personalized, if available) ──
  if (premium?.headline) {
    const hl = doc.splitTextToSize(premium.headline, W - 2 * M - 16);
    const hH = hl.length * 6.5 + 14;
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(22, 163, 74);
    doc.setLineWidth(0.8);
    doc.roundedRect(M, y, W - 2 * M, hH, 3, 3, 'FD');
    doc.setTextColor(22, 101, 52);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(hl, M + 8, y + 10);
    y += hH + 8;
  }

  // ── CLIENT INFO ──
  sectionHeader('DADOS DO CLIENTE');
  const clientRows = [
    ['Nome:', data.contact.name],
    ['Telefone:', data.contact.phone],
    ...(data.contact.email ? [['E-mail:', data.contact.email]] : []),
    ...(data.contact.company ? [['Empresa:', data.contact.company]] : []),
    ...(data.contact.address ? [['Endereço:', data.contact.address]] : []),
    ...(data.contact.city ? [['Cidade:', data.contact.city]] : []),
    ...(data.tipo_cliente ? [['Segmento:', data.tipo_cliente.charAt(0).toUpperCase() + data.tipo_cliente.slice(1)]] : []),
  ];
  clientRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(label, M, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), M + 32, y);
    y += 6.5;
  });
  y += 6;

  // ── EXECUTIVE SUMMARY ──
  if (premium?.executiveSummary) {
    sectionHeader('POR QUE ENERGIA SOLAR');
    const lines = doc.splitTextToSize(premium.executiveSummary, W - 2 * M);
    doc.text(lines, M, y);
    y += lines.length * 5 + 8;
  }

  // ── SYSTEM SIZING ──
  sectionHeader('DIMENSIONAMENTO DO SISTEMA');
  autoTable(doc, {
    startY: y,
    head: [['Especificação', 'Valor']],
    body: [
      ['Consumo Médio Mensal', `${fmtNumber(data.consumoMensal)} kWh/mês`],
      ['Potência do Sistema', `${data.potenciaSistema.toFixed(2)} kWp`],
      ['Quantidade de Painéis', `${data.quantidadePaineis} módulos`],
      ['Tipo de Módulo', 'Monocristalino 550W+'],
      ['Inversor', 'On-Grid de alta eficiência'],
      ['Garantia do Sistema', `${data.garantiaAnos} anos`],
    ],
    theme: 'striped',
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold', fontSize: 10 },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    margin: { left: M, right: M },
    styles: { fontSize: 10, cellPadding: 5 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ── FINANCIAL ANALYSIS ──
  sectionHeader('ANÁLISE FINANCEIRA');
  const roi25 = data.valorTotal > 0
    ? `${(((data.economiaAnual * 25 - data.valorTotal) / data.valorTotal) * 100).toFixed(0)}%`
    : '-';
  autoTable(doc, {
    startY: y,
    head: [['Descrição', 'Valor']],
    body: [
      ['Investimento Total', fmtCurrency(data.valorTotal)],
      ['Economia Mensal Estimada', fmtCurrency(data.economiaAnual / 12)],
      ['Economia Anual Estimada', fmtCurrency(data.economiaAnual)],
      ['Tempo de Retorno (Payback)', `${data.paybackMeses} meses`],
      ['Economia em 25 anos', fmtCurrency(data.economiaAnual * 25)],
      ['ROI em 25 anos', roi25],
    ],
    theme: 'striped',
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold', fontSize: 10 },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    margin: { left: M, right: M },
    styles: { fontSize: 10, cellPadding: 5 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ── INVESTMENT HIGHLIGHT ──
  checkPageBreak(45);
  doc.setFillColor(22, 163, 74);
  doc.roundedRect(M, y, W - 2 * M, 38, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text('INVESTIMENTO TOTAL', M + 10, y + 12);
  doc.setFontSize(22); doc.setFont('helvetica', 'bold');
  doc.text(fmtCurrency(data.valorTotal), M + 10, y + 28);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Retorno em ${data.paybackMeses} meses`, W - M - 10, y + 15, { align: 'right' });
  doc.text(`Economia de ${fmtCurrency(data.economiaAnual)}/ano`, W - M - 10, y + 25, { align: 'right' });
  y += 48;

  // ── BENEFITS / VALUE PILLARS ──
  if (premium?.valuePillars && premium.valuePillars.length > 0) {
    sectionHeader('BENEFÍCIOS DO SEU PROJETO');
    premium.valuePillars.forEach((p) => {
      checkPageBreak(10);
      const lines = doc.splitTextToSize(`✦  ${p.charAt(0).toUpperCase() + p.slice(1)}`, W - 2 * M - 8);
      doc.text(lines, M + 4, y); y += lines.length * 5 + 3;
    });
    y += 5;
  }

  // ── DIFFERENTIALS ──
  if (premium?.proofPoints && premium.proofPoints.length > 0) {
    sectionHeader('DIFERENCIAIS & GARANTIAS');
    premium.proofPoints.forEach((pt) => {
      checkPageBreak(14);
      const lines = doc.splitTextToSize(`✓  ${pt}`, W - 2 * M - 8);
      doc.text(lines, M + 4, y); y += lines.length * 5 + 3;
    });
    y += 5;
  }

  // ── FAQ ──
  if (premium?.objectionHandlers && premium.objectionHandlers.length > 0) {
    sectionHeader('PERGUNTAS FREQUENTES');
    premium.objectionHandlers.forEach((h) => {
      checkPageBreak(18);
      const lines = doc.splitTextToSize(`→  ${h}`, W - 2 * M - 8);
      doc.text(lines, M + 4, y); y += lines.length * 5 + 4;
    });
    y += 5;
  }

  // ── FINANCING ──
  if (data.taxaFinanciamento && data.taxaFinanciamento > 0 && data.valorTotal > 0) {
    sectionHeader('SIMULAÇÃO DE FINANCIAMENTO');
    const taxa = data.taxaFinanciamento;
    const pmt36 = calcPMT(taxa, 36, data.valorTotal);
    const pmt60 = calcPMT(taxa, 60, data.valorTotal);
    const econMensal = data.economiaAnual / 12;
    autoTable(doc, {
      startY: y,
      head: [['Prazo', 'Parcela Mensal', 'Total', 'Economia Mensal']],
      body: [
        ['36 meses', fmtCurrency(pmt36), fmtCurrency(pmt36 * 36), fmtCurrency(econMensal)],
        ['60 meses', fmtCurrency(pmt60), fmtCurrency(pmt60 * 60), fmtCurrency(econMensal)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      margin: { left: M, right: M },
      styles: { fontSize: 10, cellPadding: 5 },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
    doc.setTextColor(130, 130, 130); doc.setFontSize(8); doc.setFont('helvetica', 'italic');
    doc.text(`Taxa: ${taxa.toFixed(2)}% a.m. | Simulação ilustrativa, sujeita à análise de crédito.`, M, y + 4);
    y += 12;
  }

  // ── OBSERVATIONS ──
  if (data.observacoes) {
    sectionHeader('OBSERVAÇÕES');
    const obs = doc.splitTextToSize(data.observacoes, W - 2 * M);
    doc.text(obs, M, y); y += obs.length * 5 + 8;
  }

  // ── ASSUMPTIONS (premium) or GENERIC BENEFITS (basic) ──
  if (premium?.assumptions && premium.assumptions.length > 0) {
    sectionHeader('PREMISSAS DA PROPOSTA');
    doc.setTextColor(100, 100, 100); doc.setFontSize(9);
    premium.assumptions.forEach((a) => {
      checkPageBreak(12);
      const lines = doc.splitTextToSize(`•  ${a}`, W - 2 * M - 4);
      doc.text(lines, M, y); y += lines.length * 4 + 3;
    });
    y += 5;
  } else if (!premium) {
    sectionHeader('BENEFÍCIOS DA ENERGIA SOLAR');
    ['✓ Economia de até 95% na conta de luz',
     '✓ Valorização do imóvel em até 8%',
     '✓ Energia limpa e sustentável',
     '✓ Proteção contra aumentos na tarifa',
     '✓ Garantia de 25 anos nos módulos',
     '✓ Retorno do investimento garantido',
    ].forEach((b) => { checkPageBreak(8); doc.text(b, M, y); y += 6; });
    y += 5;
  }

  // ── CTA ──
  if (premium?.nextStepCta) {
    checkPageBreak(40);
    const cta = doc.splitTextToSize(premium.nextStepCta, W - 2 * M - 20);
    const ctaH = cta.length * 6 + 22;
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(22, 163, 74); doc.setLineWidth(1);
    doc.roundedRect(M, y, W - 2 * M, ctaH, 3, 3, 'FD');
    doc.setTextColor(22, 101, 52);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('PRÓXIMO PASSO', M + 10, y + 12);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(cta, M + 10, y + 22);
    y += ctaH + 8;
  }

  // ── FOOTER ──
  const validadeDias = data.validadeDias && data.validadeDias > 0 ? data.validadeDias : 15;
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const fY = H - 22;
    doc.setFillColor(22, 163, 74);
    doc.rect(0, fY - 2, W, 24, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Proposta válida por ${validadeDias} dias • Sujeita à análise técnica`, W / 2, fY + 7, { align: 'center' });
    doc.text(`SolarZap — Energia Solar | Página ${i} de ${pages}`, W / 2, fY + 14, { align: 'center' });
  }

  const fileName = `Proposta_Solar_${data.contact.name.replace(/\s+/g, '_')}_${propNum}.pdf`;
  if (data.returnBlob) return doc.output('blob');
  doc.save(fileName);
}


// ══════════════════════════════════════════════════════════
// SELLER SCRIPT PDF (internal — NOT for client)
// This is where scores, breakdown, and sales tactics go
// ══════════════════════════════════════════════════════════

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
  returnBlob?: boolean;
}

export function generateSellerScriptPDF(data: SellerScriptPDFData): Blob | void {
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 20;
  let y = 0;
  const premium = data.premiumContent;

  const checkPageBreak = (needed: number) => {
    if (y + needed > H - 30) { doc.addPage(); y = 25; return true; }
    return false;
  };

  const drawSection = (title: string) => {
    checkPageBreak(25);
    doc.setFillColor(219, 234, 254);
    doc.roundedRect(M, y, W - 2 * M, 12, 2, 2, 'F');
    doc.setTextColor(30, 64, 175);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(title, M + 6, y + 8.5);
    y += 18;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  };

  // ── Header ──
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, W, 45, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22); doc.setFont('helvetica', 'bold');
  doc.text('ROTEIRO DO VENDEDOR', M, 20);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('DOCUMENTO INTERNO — Não compartilhar com o cliente', M, 32);
  doc.setFontSize(9);
  doc.text(`${data.contact.name} • ${new Date().toLocaleDateString('pt-BR')}`, W - M, 32, { align: 'right' });
  y = 55;

  // ── Client Summary ──
  drawSection('DADOS DO CLIENTE');
  const rows = [
    ['Nome', data.contact.name], ['Telefone', data.contact.phone],
    ['Segmento', (data.tipo_cliente || 'indefinido').charAt(0).toUpperCase() + (data.tipo_cliente || 'indefinido').slice(1)],
    ['Consumo', `${data.consumoMensal} kWh/mês`],
    ['Sistema', `${data.potenciaSistema.toFixed(2)} kWp • ${data.quantidadePaineis} painéis`],
    ['Investimento', fmtCurrency(data.valorTotal)],
    ['Economia Anual', fmtCurrency(data.economiaAnual)],
    ['Economia Mensal', fmtCurrency(data.economiaAnual / 12)],
    ['Payback', `${data.paybackMeses} meses`],
  ];
  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold'); doc.text(`${label}:`, M, y);
    doc.setFont('helvetica', 'normal'); doc.text(String(value), M + 38, y);
    y += 6.5;
  });
  y += 5;

  // ── Persuasion Score (INTERNAL ONLY) ──
  if (premium?.persuasionScore) {
    checkPageBreak(25);
    const score = premium.persuasionScore;
    const color = score >= 70 ? [22, 163, 74] : score >= 50 ? [245, 158, 11] : [239, 68, 68];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(M, y, 65, 14, 3, 3, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`Score: ${score}/100`, M + 6, y + 10);
    if (premium.segmentLabel) {
      doc.setTextColor(100, 100, 100); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text(`Segmento: ${premium.segmentLabel}`, M + 72, y + 10);
    }
    y += 22;

    if (premium.scoreBreakdown) {
      const labels: Record<string, string> = { clarity: 'Clareza', personalization: 'Personaliz.', value: 'Valor', trust: 'Confiança', cta: 'CTA' };
      autoTable(doc, {
        startY: y,
        head: [['Dimensão', 'Score']],
        body: Object.entries(premium.scoreBreakdown).map(([k, v]) => [labels[k] || k, `${v}/100`]),
        theme: 'striped',
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [219, 234, 254] },
        margin: { left: M, right: M },
        styles: { fontSize: 9, cellPadding: 4 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  // ── Headline (conversation opener) ──
  if (premium?.headline) {
    drawSection('ABRIR A CONVERSA COM');
    const hl = doc.splitTextToSize(`"${premium.headline}"`, W - 2 * M);
    doc.setFont('helvetica', 'bolditalic'); doc.text(hl, M, y); doc.setFont('helvetica', 'normal');
    y += hl.length * 5 + 8;
  }

  // ── Value Pillars ──
  if (premium?.valuePillars && premium.valuePillars.length > 0) {
    drawSection('PILARES DE VALOR (enfatizar na apresentação)');
    premium.valuePillars.forEach((p) => {
      checkPageBreak(10);
      const lines = doc.splitTextToSize(`→  ${p.charAt(0).toUpperCase() + p.slice(1)}`, W - 2 * M - 8);
      doc.text(lines, M + 4, y); y += lines.length * 5 + 3;
    });
    y += 5;
  }

  // ── Proof Points ──
  if (premium?.proofPoints && premium.proofPoints.length > 0) {
    drawSection('PROVAS E DIFERENCIAIS (usar como argumento)');
    premium.proofPoints.forEach((pt) => {
      checkPageBreak(14);
      const lines = doc.splitTextToSize(`✓  ${pt}`, W - 2 * M - 8);
      doc.text(lines, M + 4, y); y += lines.length * 5 + 3;
    });
    y += 5;
  }

  // ── Objection Handlers ──
  if (premium?.objectionHandlers && premium.objectionHandlers.length > 0) {
    drawSection('RESPOSTAS A OBJEÇÕES (se o cliente perguntar)');
    premium.objectionHandlers.forEach((h, i) => {
      checkPageBreak(18);
      const lines = doc.splitTextToSize(`${i + 1}. ${h}`, W - 2 * M - 8);
      doc.text(lines, M + 4, y); y += lines.length * 5 + 4;
    });
    y += 5;
  }

  // ── Financing Cheat Sheet ──
  if (data.taxaFinanciamento && data.taxaFinanciamento > 0 && data.valorTotal > 0) {
    drawSection('FINANCIAMENTO (dados rápidos)');
    const taxa = data.taxaFinanciamento;
    const pmt36 = calcPMT(taxa, 36, data.valorTotal);
    const pmt60 = calcPMT(taxa, 60, data.valorTotal);
    const econMensal = data.economiaAnual / 12;

    doc.text(`Taxa: ${taxa.toFixed(2)}% a.m.`, M + 4, y); y += 6.5;
    doc.text(`36x de ${fmtCurrency(pmt36)} (total: ${fmtCurrency(pmt36 * 36)})`, M + 4, y); y += 6.5;
    doc.text(`60x de ${fmtCurrency(pmt60)} (total: ${fmtCurrency(pmt60 * 60)})`, M + 4, y); y += 6.5;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 163, 74);
    if (econMensal > pmt60) {
      doc.text(`Parcela 60x (${fmtCurrency(pmt60)}) < economia mensal (${fmtCurrency(econMensal)})! Use isso!`, M + 4, y);
    } else {
      doc.text(`Economia mensal: ${fmtCurrency(econMensal)} — compare com a parcela.`, M + 4, y);
    }
    doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
    y += 10;
  }

  // ── CTA / Closing ──
  if (premium?.nextStepCta) {
    drawSection('FRASE DE FECHAMENTO');
    const cta = doc.splitTextToSize(premium.nextStepCta, W - 2 * M - 16);
    const ctaH = cta.length * 6 + 18;
    doc.setFillColor(219, 234, 254); doc.setDrawColor(30, 64, 175); doc.setLineWidth(1);
    doc.roundedRect(M, y, W - 2 * M, ctaH, 3, 3, 'FD');
    doc.setTextColor(30, 64, 175); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(cta, M + 8, y + 10);
    y += ctaH + 8;
  }

  // ── Footer ──
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const fY = H - 18;
    doc.setTextColor(150, 150, 150); doc.setFontSize(8); doc.setFont('helvetica', 'italic');
    doc.text('DOCUMENTO INTERNO — Uso exclusivo do vendedor — Não compartilhar com o cliente', W / 2, fY, { align: 'center' });
    doc.text(`Roteiro do Vendedor • ${data.contact.name} • Página ${i} de ${total}`, W / 2, fY + 7, { align: 'center' });
  }

  const fileName = `Roteiro_Vendedor_${data.contact.name.replace(/\s+/g, '_')}_${Date.now().toString().slice(-8)}.pdf`;
  if (data.returnBlob) return doc.output('blob');
  doc.save(fileName);
}
