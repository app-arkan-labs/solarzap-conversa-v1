// ══════════════════════════════════════════════════════════
// Proposal Charts — Native jsPDF + Canvas drawing for PDF
// Draws charts directly into jsPDF documents using drawing
// primitives and optional offscreen canvas for complex shapes.
// ══════════════════════════════════════════════════════════
import jsPDF from 'jspdf';
import { isSolarResourceApiEnabled } from '@/config/featureFlags';

type RGB = [number, number, number];

export interface ChartTheme {
  primary: RGB;
  primaryDark: RGB;
  primaryLight: RGB;
  accent: RGB;
  accentAlt: RGB;
  text: RGB;
  textLight: RGB;
  gridLine: RGB;
  white: RGB;
  green: RGB;
  red: RGB;
  gold: RGB;
}

export const DEFAULT_CHART_THEME: ChartTheme = {
  primary: [23, 122, 77],
  primaryDark: [10, 31, 59],
  primaryLight: [230, 245, 237],
  accent: [184, 140, 69],
  accentAlt: [59, 130, 246],
  text: [30, 41, 59],
  textLight: [100, 116, 139],
  gridLine: [226, 232, 240],
  white: [255, 255, 255],
  green: [22, 163, 74],
  red: [220, 38, 38],
  gold: [184, 140, 69],
};

// ── Utilities ──────────────────────────────────────────────
function setFill(doc: jsPDF, c: RGB) {
  doc.setFillColor(c[0], c[1], c[2]);
}
function setDraw(doc: jsPDF, c: RGB) {
  doc.setDrawColor(c[0], c[1], c[2]);
}
function setTextC(doc: jsPDF, c: RGB) {
  doc.setTextColor(c[0], c[1], c[2]);
}
function fmtCurrencyShort(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}mil`;
  return `R$ ${v.toFixed(0)}`;
}
function fmtCurrency(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function fmtNumber(v: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v);
}
function fmtNumberShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)} mil`;
  return fmtNumber(v);
}

function mixRgb(base: RGB, target: RGB, alpha: number): RGB {
  return [
    Math.max(0, Math.min(255, Math.round(base[0] * (1 - alpha) + target[0] * alpha))),
    Math.max(0, Math.min(255, Math.round(base[1] * (1 - alpha) + target[1] * alpha))),
    Math.max(0, Math.min(255, Math.round(base[2] * (1 - alpha) + target[2] * alpha))),
  ];
}

// ══════════════════════════════════════════════════════════
// 1) BAR CHART: "Conta de Luz Antes vs Com Solar"
// ══════════════════════════════════════════════════════════
export function drawSavingsBarChart(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  data: { contaAtual: number; contaComSolar: number; economiaMensal: number },
  theme: ChartTheme = DEFAULT_CHART_THEME,
) {
  const padding = { top: 18, bottom: 22, left: 8, right: 8 };
  const chartH = h - padding.top - padding.bottom;
  const chartW = w - padding.left - padding.right;
  const maxVal = Math.max(data.contaAtual, data.contaComSolar) * 1.15;

  // Background card
  setFill(doc, theme.white);
  setDraw(doc, theme.gridLine);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');

  // Title
  setTextC(doc, theme.text);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('Sua Conta de Luz: Antes vs Com Solar', x + w / 2, y + 10, { align: 'center' });

  const barW = chartW * 0.25;
  const gap = chartW * 0.1;
  const totalBarsW = barW * 2 + gap;
  const startX = x + padding.left + (chartW - totalBarsW) / 2;
  const baseY = y + padding.top + chartH;

  // Grid lines (3 horizontal)
  doc.setLineWidth(0.15);
  setDraw(doc, theme.gridLine);
  for (let i = 0; i <= 3; i++) {
    const gy = baseY - (chartH / 3) * i;
    doc.line(x + padding.left, gy, x + w - padding.right, gy);
    setTextC(doc, theme.textLight);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
    const label = fmtCurrencyShort((maxVal / 3) * i);
    doc.text(label, x + padding.left - 1, gy - 1, { align: 'right' });
  }

  // Bar 1: Conta Atual (red-ish)
  const h1 = (data.contaAtual / maxVal) * chartH;
  setFill(doc, theme.red);
  doc.roundedRect(startX, baseY - h1, barW, h1, 1.5, 1.5, 'F');
  // Value on top of bar
  setTextC(doc, theme.red);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text(fmtCurrency(data.contaAtual), startX + barW / 2, baseY - h1 - 3, { align: 'center' });
  // Label
  setTextC(doc, theme.text);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('Antes', startX + barW / 2, baseY + 5, { align: 'center' });

  // Bar 2: Com Solar (green)
  const h2 = (data.contaComSolar / maxVal) * chartH;
  setFill(doc, theme.green);
  doc.roundedRect(startX + barW + gap, baseY - h2, barW, h2, 1.5, 1.5, 'F');
  setTextC(doc, theme.green);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text(fmtCurrency(data.contaComSolar), startX + barW + gap + barW / 2, baseY - h2 - 3, { align: 'center' });
  setTextC(doc, theme.text);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('Com Solar', startX + barW + gap + barW / 2, baseY + 5, { align: 'center' });

  // Savings badge
  setFill(doc, theme.primaryLight);
  const badgeText = `Economia: ${fmtCurrency(data.economiaMensal)}/mes`;
  const badgeW = doc.getTextWidth(badgeText) + 8;
  doc.roundedRect(x + w / 2 - badgeW / 2, baseY + 9, badgeW, 8, 2, 2, 'F');
  setTextC(doc, theme.primary);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  doc.text(badgeText, x + w / 2, baseY + 14, { align: 'center' });
}

// ══════════════════════════════════════════════════════════
// 1b) BAR CHART: Usina — Investimento vs Receita Anual
// ══════════════════════════════════════════════════════════
export function drawRevenueBarChart(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  data: {
    investimento: number;
    receitaAnual: number;
    receita5Anos?: number;
    receita15Anos?: number;
    receita25Anos?: number;
    paybackYears?: number;
  },
  theme: ChartTheme = DEFAULT_CHART_THEME,
) {
  const padding = { top: 18, bottom: 22, left: 9, right: 8 };
  const chartH = h - padding.top - padding.bottom;
  const chartW = w - padding.left - padding.right;

  // Background card
  setFill(doc, theme.white);
  setDraw(doc, theme.gridLine);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');

  // Title
  setTextC(doc, theme.text);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('Investimento vs Receita Projetada', x + w / 2, y + 10, { align: 'center' });

  const receita5Anos = data.receita5Anos ?? (data.receitaAnual * 5);
  const receita15Anos = data.receita15Anos ?? (data.receitaAnual * 15);
  const receita25Anos = data.receita25Anos ?? (data.receitaAnual * 25);

  const items = [
    { label: 'Investimento', value: data.investimento, color: theme.red },
    { label: 'Receita 5 anos', value: receita5Anos, color: [56, 189, 248] as RGB },
    { label: 'Receita 15 anos', value: receita15Anos, color: [22, 163, 74] as RGB },
    { label: 'Receita 25 anos', value: receita25Anos, color: [5, 150, 105] as RGB },
  ];

  const maxVal = Math.max(...items.map(i => i.value), 1) * 1.1;
  const slotW = chartW / items.length;
  const barW = slotW * 0.62;
  const gapW = slotW - barW;
  const startX = x + padding.left;
  const baseY = y + padding.top + chartH;

  // Grid lines
  doc.setLineWidth(0.15);
  setDraw(doc, theme.gridLine);
  for (let i = 0; i <= 3; i++) {
    const gy = baseY - (chartH / 3) * i;
    doc.line(x + padding.left, gy, x + w - padding.right, gy);
    setTextC(doc, theme.textLight);
    doc.setFontSize(6); doc.setFont('helvetica', 'normal');
    doc.text(fmtCurrencyShort((maxVal / 3) * i), x + padding.left - 1, gy - 1, { align: 'right' });
  }

  items.forEach((item, i) => {
    const bx = startX + i * slotW + gapW / 2;
    const bh = Math.max((item.value / maxVal) * chartH, 1);

    setFill(doc, item.color as RGB);
    doc.roundedRect(bx, baseY - bh, barW, bh, 1.5, 1.5, 'F');
    setTextC(doc, item.color as RGB);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
    doc.text(fmtCurrencyShort(item.value), bx + barW / 2, baseY - bh - 3, { align: 'center' });
    setTextC(doc, theme.text);
    doc.setFontSize(6); doc.setFont('helvetica', 'normal');
    const labelLines = doc.splitTextToSize(item.label, barW + 8);
    doc.text(labelLines, bx + barW / 2, baseY + 5, { align: 'center' });
  });

  // Payback badge
  const paybackAnos = Number.isFinite(data.paybackYears as number) && (data.paybackYears as number) > 0
    ? (data.paybackYears as number)
    : (data.receitaAnual > 0 ? (data.investimento / data.receitaAnual) : 0);
  if (paybackAnos > 0) {
    setFill(doc, theme.primaryLight);
    const badgeText = `Payback: ${paybackAnos.toFixed(1)} anos`;
    const badgeW = doc.getTextWidth(badgeText) + 8;
    doc.roundedRect(x + w / 2 - badgeW / 2, baseY + 9, badgeW, 8, 2, 2, 'F');
    setTextC(doc, theme.primary);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text(badgeText, x + w / 2, baseY + 14, { align: 'center' });
  }
}

// ══════════════════════════════════════════════════════════
// 2) AREA CHART: Cumulative Savings Over 25 Years
// ══════════════════════════════════════════════════════════
export function drawCumulativeSavingsChart(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  data: {
    valorTotal: number;
    economiaMensal: number;
    paybackMeses: number;
    cumulativeRevenueSeries?: number[];
  },
  theme: ChartTheme = DEFAULT_CHART_THEME,
  isUsina: boolean = false,
) {
  const padding = { top: 18, bottom: 24, left: 10, right: 10 };
  const chartH = h - padding.top - padding.bottom;
  const chartW = w - padding.left - padding.right;

  // Bg card
  setFill(doc, theme.white);
  setDraw(doc, theme.gridLine);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');

  // Title
  setTextC(doc, theme.text);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text(isUsina ? 'Receita Acumulada em 25 Anos' : 'Economia Acumulada em 25 Anos', x + w / 2, y + 10, { align: 'center' });

  const baseY = y + padding.top + chartH;
  const baseX = x + padding.left;
  const totalYears = Math.max(1, data.cumulativeRevenueSeries?.length || 25);
  const econAnual = data.economiaMensal * 12;
  const maxSavings = data.cumulativeRevenueSeries?.length
    ? Math.max(0, data.cumulativeRevenueSeries[data.cumulativeRevenueSeries.length - 1] || 0)
    : econAnual * totalYears;
  const maxY = Math.max(maxSavings, data.valorTotal) * 1.1;
  const paybackYears = data.paybackMeses / 12;
  const getSavingsAtYear = (yearRaw: number) => {
    const year = Math.max(0, Math.min(totalYears, yearRaw));
    if (!data.cumulativeRevenueSeries?.length) return econAnual * year;
    if (year <= 0) return 0;
    if (year >= totalYears) return data.cumulativeRevenueSeries[totalYears - 1] || 0;
    const lower = Math.floor(year);
    const upper = Math.ceil(year);
    if (lower === upper) {
      return lower <= 0 ? 0 : (data.cumulativeRevenueSeries[lower - 1] || 0);
    }
    const lowerValue = lower <= 0 ? 0 : (data.cumulativeRevenueSeries[lower - 1] || 0);
    const upperValue = data.cumulativeRevenueSeries[upper - 1] || lowerValue;
    const ratio = year - lower;
    return lowerValue + ((upperValue - lowerValue) * ratio);
  };

  // Grid lines
  doc.setLineWidth(0.15);
  setDraw(doc, theme.gridLine);
  for (let i = 0; i <= 4; i++) {
    const gy = baseY - (chartH / 4) * i;
    doc.line(baseX, gy, baseX + chartW, gy);
    setTextC(doc, theme.textLight);
    doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
    doc.text(fmtCurrencyShort((maxY / 4) * i), baseX - 1, gy + 1, { align: 'right' });
  }

  // X-axis labels (every 5 years)
  for (let yr = 0; yr <= totalYears; yr += 5) {
    const px = baseX + (yr / totalYears) * chartW;
    setTextC(doc, theme.textLight);
    doc.setFontSize(6); doc.setFont('helvetica', 'normal');
    doc.text(`${yr}`, px, baseY + 5, { align: 'center' });
  }
  doc.text('anos', baseX + chartW + 4, baseY + 5, { align: 'center' });

  // Investment line (horizontal dashed)
  const investY = baseY - (data.valorTotal / maxY) * chartH;
  setDraw(doc, theme.red);
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(baseX, investY, baseX + chartW, investY);
  doc.setLineDashPattern([], 0);

  // Investment label
  setTextC(doc, theme.red);
  doc.setFontSize(6); doc.setFont('helvetica', 'bold');
  doc.text(`Investimento: ${fmtCurrencyShort(data.valorTotal)}`, baseX + chartW, investY - 2, { align: 'right' });

  // Savings area (fill under curve)
  // Use canvas for smooth area fill, then embed as image
  const canvas = document.createElement('canvas');
  const dpr = 2;
  const cW = Math.round(chartW * dpr * 3);
  const cH = Math.round(chartH * dpr * 3);
  canvas.width = cW;
  canvas.height = cH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, cW, cH);

    // Draw filled area
    ctx.beginPath();
    ctx.moveTo(0, cH);
    for (let yr = 0; yr <= totalYears; yr++) {
      const savings = getSavingsAtYear(yr);
      const px = (yr / totalYears) * cW;
      const py = cH - (savings / maxY) * cH;
      if (yr === 0) ctx.lineTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(cW, cH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, cH);
    grad.addColorStop(0, `rgba(${theme.primary[0]}, ${theme.primary[1]}, ${theme.primary[2]}, 0.35)`);
    grad.addColorStop(1, `rgba(${theme.primary[0]}, ${theme.primary[1]}, ${theme.primary[2]}, 0.05)`);
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw line on top with green gains after payback.
    const safePaybackYears = Number.isFinite(paybackYears)
      ? Math.max(0, Math.min(totalYears, paybackYears))
      : 0;
    const splitX = (safePaybackYears / totalYears) * cW;
    const splitY = cH - ((getSavingsAtYear(safePaybackYears) / maxY) * cH);

    if (safePaybackYears <= 0 || safePaybackYears >= totalYears) {
      ctx.beginPath();
      for (let yr = 0; yr <= totalYears; yr++) {
        const savings = getSavingsAtYear(yr);
        const px = (yr / totalYears) * cW;
        const py = cH - (savings / maxY) * cH;
        if (yr === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgb(${theme.primary[0]}, ${theme.primary[1]}, ${theme.primary[2]})`;
      ctx.lineWidth = 3 * dpr;
      ctx.stroke();
    } else {
      ctx.beginPath();
      for (let yr = 0; yr <= safePaybackYears; yr += 0.2) {
        const savings = getSavingsAtYear(yr);
        const px = (yr / totalYears) * cW;
        const py = cH - (savings / maxY) * cH;
        if (yr === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.lineTo(splitX, splitY);
      ctx.strokeStyle = `rgb(${theme.primary[0]}, ${theme.primary[1]}, ${theme.primary[2]})`;
      ctx.lineWidth = 3 * dpr;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(splitX, splitY);
      for (let yr = safePaybackYears; yr <= totalYears; yr += 0.2) {
        const savings = getSavingsAtYear(yr);
        const px = (yr / totalYears) * cW;
        const py = cH - (savings / maxY) * cH;
        ctx.lineTo(px, py);
      }
      ctx.lineTo(cW, cH - (getSavingsAtYear(totalYears) / maxY) * cH);
      ctx.strokeStyle = `rgb(${theme.green[0]}, ${theme.green[1]}, ${theme.green[2]})`;
      ctx.lineWidth = 3 * dpr;
      ctx.stroke();
    }

    // Payback marker
    if (paybackYears > 0 && paybackYears <= totalYears) {
      const px = (paybackYears / totalYears) * cW;
      const py = cH - (data.valorTotal / maxY) * cH;
      ctx.beginPath();
      ctx.arc(px, py, 6 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${theme.accent[0]}, ${theme.accent[1]}, ${theme.accent[2]})`;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
    }

    try {
      const imgData = canvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', baseX, y + padding.top, chartW, chartH);
    } catch {
      // Fallback: no canvas support
    }
  }

  // Payback annotation
  if (paybackYears > 0 && paybackYears <= totalYears) {
    const paybackX = baseX + (paybackYears / totalYears) * chartW;
    setDraw(doc, theme.accent);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.line(paybackX, y + padding.top, paybackX, baseY);
    doc.setLineDashPattern([], 0);

    setTextC(doc, theme.accent);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
    doc.text(`Payback: ${paybackYears.toFixed(1)} anos`, paybackX, baseY + 11, { align: 'center' });
  }

  // Total savings badge
  const totalBadgeFill = isUsina
    ? mixRgb(theme.green, [255, 255, 255], 0.83)
    : theme.primaryLight;
  const totalBadgeText = isUsina ? theme.green : theme.primary;
  setFill(doc, totalBadgeFill);
  const totalText = `${isUsina ? 'Receita total' : 'Economia total'}: ${fmtCurrencyShort(maxSavings)} em 25 anos`;
  const tw = doc.getTextWidth(totalText) + 8;
  doc.roundedRect(x + w / 2 - tw / 2, baseY + 14, tw, 7, 2, 2, 'F');
  setTextC(doc, totalBadgeText);
  doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  doc.text(totalText, x + w / 2, baseY + 19, { align: 'center' });
}

// ══════════════════════════════════════════════════════════
// 3) PIE CHART: ROI Breakdown
// ══════════════════════════════════════════════════════════
export function drawROIPieChart(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  data: { valorTotal: number; retornoLiquido: number },
  theme: ChartTheme = DEFAULT_CHART_THEME,
) {
  // Bg card
  setFill(doc, theme.white);
  setDraw(doc, theme.gridLine);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');

  setTextC(doc, theme.text);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('Retorno sobre Investimento', x + w / 2, y + 10, { align: 'center' });

  const total = Math.max(0, data.valorTotal + data.retornoLiquido);
  const investPct = total > 0 ? data.valorTotal / total : 0;
  const retornoPct = total > 0 ? data.retornoLiquido / total : 0;

  const cx = x + w * 0.35;
  const cy = y + h * 0.55;
  const radius = Math.min(w, h) * 0.25;

  // Draw pie using canvas for smooth arcs
  const canvas = document.createElement('canvas');
  const size = Math.round(radius * 2 * 6);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cr = size / 2;
    const r = cr * 0.85;

    // Retorno slice (start from top)
    ctx.beginPath();
    ctx.moveTo(cr, cr);
    const startAngle = -Math.PI / 2;
    const retornoEnd = startAngle + retornoPct * Math.PI * 2;
    ctx.arc(cr, cr, r, startAngle, retornoEnd);
    ctx.closePath();
    ctx.fillStyle = `rgb(${theme.green[0]}, ${theme.green[1]}, ${theme.green[2]})`;
    ctx.fill();

    // Investimento slice
    ctx.beginPath();
    ctx.moveTo(cr, cr);
    ctx.arc(cr, cr, r, retornoEnd, startAngle + Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = `rgb(${theme.red[0]}, ${theme.red[1]}, ${theme.red[2]})`;
    ctx.fill();

    // White center for donut effect
    ctx.beginPath();
    ctx.arc(cr, cr, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    try {
      const imgData = canvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', cx - radius, cy - radius, radius * 2, radius * 2);
    } catch {
      // Fallback
    }
  }

  // ROI text in center
  const roiPct = data.valorTotal > 0 && data.retornoLiquido > 0
    ? `${((data.retornoLiquido / data.valorTotal) * 100).toFixed(0)}%`
    : '-';
  setTextC(doc, theme.text);
  const innerDiameter = radius;
  const maxCenterTextW = innerDiameter * 0.88;
  let roiFont = 12.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(roiFont);
  while (roiFont > 7 && doc.getTextWidth(roiPct) > maxCenterTextW) {
    roiFont -= 0.5;
    doc.setFontSize(roiFont);
  }
  doc.text(roiPct, cx, cy + 0.6, { align: 'center' });
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
  doc.text('ROI 25 anos', cx, cy + 4.8, { align: 'center' });

  // Legend (right side)
  const lx = x + w * 0.6;
  const ly = cy - 10;

  setFill(doc, theme.green);
  doc.rect(lx, ly, 4, 4, 'F');
  setTextC(doc, theme.text);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text(`Retorno: ${fmtCurrencyShort(data.retornoLiquido)}`, lx + 6, ly + 3.5);
  doc.text(`(${(retornoPct * 100).toFixed(0)}%)`, lx + 6, ly + 8);

  setFill(doc, theme.red);
  doc.rect(lx, ly + 14, 4, 4, 'F');
  doc.text(`Investimento: ${fmtCurrencyShort(data.valorTotal)}`, lx + 6, ly + 17.5);
  doc.text(`(${(investPct * 100).toFixed(0)}%)`, lx + 6, ly + 22);

  // Summary line
  const retornoPorReal = data.valorTotal > 0 ? (data.retornoLiquido / data.valorTotal + 1) : 0;
  setTextC(doc, theme.green);
  doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  doc.text(
    `Para cada R$ 1 investido, voce recupera R$ ${retornoPorReal.toFixed(1)}`,
    x + w / 2, y + h - 6, { align: 'center' }
  );
}

// ══════════════════════════════════════════════════════════
// 4) ENVIRONMENTAL IMPACT INFOGRAPHIC
// ══════════════════════════════════════════════════════════
export interface EnvironmentalData {
  co2Tons: number;
  trees: number;
  carKm: number;
}

export function calcEnvironmentalImpact(
  econAnualKwh: number,
  years: number = 25,
): EnvironmentalData {
  // Brazilian SIN emission factor: ~0.0817 tCO2/MWh (EPE/ANEEL 2024)
  const totalKwh = econAnualKwh * years;
  const co2Tons = (totalKwh / 1000) * 0.0817;
  // 1 tree absorbs ~22 kg CO2/year → over lifespan
  const trees = Math.round((co2Tons * 1000) / (22 * years));
  // 1 liter gasoline ≈ 2.3 kg CO2, avg car ≈ 12 km/l
  const carKm = Math.round((co2Tons * 1000) / 2.3 * 12);
  return { co2Tons: Math.round(co2Tons * 10) / 10, trees, carKm };
}

export function drawEnvironmentalImpact(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  data: EnvironmentalData,
  theme: ChartTheme = DEFAULT_CHART_THEME,
) {
  // Card background
  setFill(doc, theme.primaryLight);
  setDraw(doc, theme.gridLine);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');

  // Title
  setTextC(doc, theme.primary);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('Impacto Ambiental em 25 Anos', x + w / 2, y + 10, { align: 'center' });

  // Subtitle
  setTextC(doc, theme.textLight);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('Ao gerar sua propria energia limpa, voce contribui com o meio ambiente', x + w / 2, y + 17, { align: 'center' });

  const colW = w / 3;
  const items = [
    {
      value: `${data.co2Tons.toFixed(1)} t`,
      label: 'CO2 evitado',
      sub: `${(data.co2Tons * 1000).toFixed(0)} kg de gas carbonico`,
      color: theme.primary,
    },
    {
      value: `${data.trees}`,
      label: 'Arvores equivalentes',
      sub: `Mesmo que plantar ${data.trees} arvores`,
      color: theme.green,
    },
    {
      value: `${(data.carKm / 1000).toFixed(0)} mil km`,
      label: 'Km de carro evitados',
      sub: `${Math.round(data.carKm / 40000)} voltas ao redor da Terra`,
      color: theme.accent,
    },
  ];

  items.forEach((item, i) => {
    const cx = x + colW * i + colW / 2;
    const iy = y + 26;

    // Icon circle
    setFill(doc, item.color as RGB);
    doc.circle(cx, iy, 6, 'F');

    // Icon token (ASCII-safe for Helvetica)
    setTextC(doc, theme.white);
    const icon = i === 0 ? 'CO2' : i === 1 ? 'ARV' : 'KM';
    doc.setFontSize(icon.length > 2 ? 5.5 : 7);
    doc.setFont('helvetica', 'bold');
    doc.text(icon, cx, iy + 1.6, { align: 'center' });

    // Value
    setTextC(doc, theme.text);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(item.value, cx, iy + 15, { align: 'center' });

    // Label
    setTextC(doc, theme.primary);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text(item.label, cx, iy + 21, { align: 'center' });

    // Sub-description
    setTextC(doc, theme.textLight);
    doc.setFontSize(6); doc.setFont('helvetica', 'normal');
    const subLines = doc.splitTextToSize(item.sub, colW - 8);
    doc.text(subLines, cx, iy + 26, { align: 'center' });
  });
}

// ══════════════════════════════════════════════════════════
// 5) MONTHLY GENERATION BAR CHART
// ══════════════════════════════════════════════════════════
const LEGACY_SEASONAL_PROFILE = [
  1.18, 1.15, 1.08, 0.95, 0.78, 0.70,
  0.74, 0.88, 0.96, 1.07, 1.16, 1.23,
];
export const normalizeGenerationFactors = (factors: number[]): number[] => {
  if (!Array.isArray(factors) || factors.length !== 12) return BRAZIL_MONTHLY_IRRADIATION_FACTOR;
  const safeFactors = factors.map((value) => Math.max(0, Number(value) || 0));
  if (safeFactors.some((value) => value <= 0)) return BRAZIL_MONTHLY_IRRADIATION_FACTOR;
  const avg = safeFactors.reduce((acc, v) => acc + v, 0) / safeFactors.length;
  if (!Number.isFinite(avg) || avg <= 0) return BRAZIL_MONTHLY_IRRADIATION_FACTOR;
  return safeFactors.map((v) => v / avg);
};

const normalizeFactors = (factors: number[]): number[] => {
  const avg = factors.reduce((acc, v) => acc + v, 0) / factors.length;
  if (!Number.isFinite(avg) || avg <= 0) return factors;
  return factors.map((v) => v / avg);
};
export const BRAZIL_MONTHLY_IRRADIATION_FACTOR = normalizeFactors(LEGACY_SEASONAL_PROFILE);
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function calcMonthlyGeneration(
  potenciaKwp: number,
  consumoMensal?: number,
  options?: {
    monthlyGenerationFactors?: number[] | null;
  },
): number[] {
  const seasonalFactors = normalizeGenerationFactors(options?.monthlyGenerationFactors || BRAZIL_MONTHLY_IRRADIATION_FACTOR);
  const consumoBase = Number(consumoMensal);
  if (Number.isFinite(consumoBase) && consumoBase > 0) {
    return seasonalFactors.map((factor) => Math.round(consumoBase * factor));
  }

  // Fallback from installed power
  const avgDaily = 4.5;
  const pr = 0.80;
  const daysInMonth = isSolarResourceApiEnabled() ? 30.4375 : 30;
  const potenciaBase = Math.max(Number(potenciaKwp) || 0, 0);
  const monthlyAvg = potenciaBase * avgDaily * daysInMonth * pr;
  return seasonalFactors.map((factor) => Math.round(monthlyAvg * factor));
}

export function drawMonthlyGenerationChart(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  monthlyKwh: number[],
  theme: ChartTheme = DEFAULT_CHART_THEME,
) {
  const padding = { top: 20, bottom: 20, left: 18, right: 8 };
  const chartH = h - padding.top - padding.bottom;
  const chartW = w - padding.left - padding.right;

  // Bg card
  setFill(doc, theme.white);
  setDraw(doc, theme.gridLine);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');

  setTextC(doc, theme.text);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('Geracao Mensal Estimada (kWh)', x + w / 2, y + 10, { align: 'center' });

  const values = monthlyKwh.slice(0, 12).map((value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return Math.round(numeric);
  });
  while (values.length < 12) values.push(0);

  const rawMax = Math.max(...values, 1);
  const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(rawMax))));
  const scaled = rawMax / magnitude;
  const niceScale = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  const maxKwh = niceScale * magnitude;

  const baseY = y + padding.top + chartH;
  const baseX = x + padding.left;
  const slotW = chartW / 12;
  const barW = slotW * 0.7;
  const barGap = slotW - barW;

  // Grid lines + Y labels
  doc.setLineWidth(0.12);
  setDraw(doc, theme.gridLine);
  for (let i = 0; i <= 4; i++) {
    const gy = baseY - (chartH / 4) * i;
    doc.line(baseX, gy, baseX + chartW, gy);
    setTextC(doc, theme.textLight);
    doc.setFontSize(5.8); doc.setFont('helvetica', 'normal');
    const axisValue = (maxKwh / 4) * i;
    doc.text(fmtNumber(axisValue), baseX - 2, gy + 1.5, { align: 'right' });
  }
  setTextC(doc, theme.textLight);
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
  doc.text('(kWh)', baseX - 2, baseY + 6, { align: 'right' });

  values.forEach((kwh, i) => {
    const bx = baseX + slotW * i + barGap / 2;
    const bh = Math.max((kwh / maxKwh) * chartH, 1);

    setFill(doc, theme.primary);
    doc.roundedRect(bx, baseY - bh, barW, bh, 1, 1, 'F');
    setFill(doc, [
      Math.min(255, theme.primary[0] + 30),
      Math.min(255, theme.primary[1] + 30),
      Math.min(255, theme.primary[2] + 30),
    ] as RGB);
    doc.roundedRect(bx, baseY - bh, barW, bh / 2, 1, 1, 'F');

    // Value on top
    setTextC(doc, theme.text);
    doc.setFontSize(6); doc.setFont('helvetica', 'bold');
    doc.text(`${kwh}`, bx + barW / 2, baseY - bh - 2, { align: 'center' });

    // Month label
    setTextC(doc, theme.textLight);
    doc.setFontSize(6); doc.setFont('helvetica', 'normal');
    doc.text(MONTH_LABELS[i], bx + barW / 2, baseY + 4, { align: 'center' });
  });

  // Average line
  const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
  const avgY = baseY - (avg / maxKwh) * chartH;
  setDraw(doc, theme.accent);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([2, 1.5], 0);
  doc.line(baseX, avgY, baseX + chartW, avgY);
  doc.setLineDashPattern([], 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.1);
  const avgText = `Media: ${fmtNumberShort(avg)} kWh`;
  const avgBadgeW = doc.getTextWidth(avgText) + 6;
  const avgBadgeX = baseX + chartW - avgBadgeW;
  const avgBadgeY = y + 11;
  setFill(doc, theme.white);
  setDraw(doc, theme.accent);
  doc.setLineWidth(0.2);
  doc.roundedRect(avgBadgeX, avgBadgeY - 4.1, avgBadgeW, 5, 1, 1, 'FD');
  setTextC(doc, theme.accent);
  doc.text(avgText, avgBadgeX + avgBadgeW / 2, avgBadgeY - 0.4, { align: 'center' });

  // Total annual
  const totalAnual = values.reduce((acc, value) => acc + value, 0);
  setTextC(doc, theme.green);
  doc.setFontSize(7.2); doc.setFont('helvetica', 'bold');
  doc.text(`Total anual estimado: ${totalAnual.toLocaleString('pt-BR')} kWh`, x + w / 2, baseY + 12, { align: 'center' });
}

// ══════════════════════════════════════════════════════════
// 6) FINANCING COMPARISON BAR CHART
// ══════════════════════════════════════════════════════════
export function drawFinancingComparisonChart(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  data: { parcela36: number; parcela60: number; economiaMensal: number },
  theme: ChartTheme = DEFAULT_CHART_THEME,
) {
  const padding = { top: 18, bottom: 14, left: 8, right: 8 };
  const chartH = h - padding.top - padding.bottom;
  const chartW = w - padding.left - padding.right;

  setFill(doc, theme.white);
  setDraw(doc, theme.gridLine);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');

  setTextC(doc, theme.text);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('Parcela vs Economia Mensal', x + w / 2, y + 10, { align: 'center' });

  const baseY = y + padding.top + chartH;
  const maxVal = Math.max(data.parcela36, data.parcela60, data.economiaMensal) * 1.15;
  const barW = chartW * 0.2;
  const items = [
    { label: 'Parcela 36x', value: data.parcela36, color: theme.accent },
    { label: 'Parcela 60x', value: data.parcela60, color: theme.gold },
    { label: 'Economia', value: data.economiaMensal, color: theme.green },
  ].filter(item => item.value > 0);

  const totalW = items.length * barW + (items.length - 1) * barW * 0.4;
  const startX = x + padding.left + (chartW - totalW) / 2;

  items.forEach((item, i) => {
    const bx = startX + i * (barW + barW * 0.4);
    const bh = (item.value / maxVal) * chartH;

    setFill(doc, item.color as RGB);
    doc.roundedRect(bx, baseY - bh, barW, bh, 1.5, 1.5, 'F');

    setTextC(doc, item.color as RGB);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text(fmtCurrency(item.value), bx + barW / 2, baseY - bh - 3, { align: 'center' });

    setTextC(doc, theme.text);
    doc.setFontSize(6); doc.setFont('helvetica', 'normal');
    const labelLines = doc.splitTextToSize(item.label, barW + 4);
    doc.text(labelLines, bx + barW / 2, baseY + 4, { align: 'center' });
  });

  // Highlight if parcela60 < economia
  if (data.parcela60 > 0 && data.economiaMensal > data.parcela60) {
    setFill(doc, theme.primaryLight);
    const msg = 'Parcela menor que a economia! O sistema se paga sozinho.';
    const msgW = doc.getTextWidth(msg) + 8;
    doc.roundedRect(x + w / 2 - msgW / 2, baseY + 9, msgW, 6, 2, 2, 'F');
    setTextC(doc, theme.primary);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
    doc.text(msg, x + w / 2, baseY + 13.5, { align: 'center' });
  }
}

// ══════════════════════════════════════════════════════════
// 7) BEFORE/AFTER COMPARISON TABLE (visual)
// ══════════════════════════════════════════════════════════
export function drawBeforeAfterComparison(
  doc: jsPDF,
  x: number, y: number, w: number,
  data: { contaAtual: number; contaComSolar: number; economiaMensal: number; econAnual: number; custo25AnosSem: number; custo25AnosCom: number },
  theme: ChartTheme = DEFAULT_CHART_THEME,
  isUsina: boolean = false
): number {
  const colW = (w - 4) / 2;
  const rowH = 10;
  const headerH = 10;

  // IDENTITY: custo_sem = custo_com + economia (must hold at every time horizon)
  const economiaMensal = data.contaAtual - data.contaComSolar;
  const economia25Anos = data.custo25AnosSem - data.custo25AnosCom;
  const rows = [
    { label: isUsina ? 'Custo oportunidade mensal' : 'Conta mensal', before: fmtCurrency(data.contaAtual), after: fmtCurrency(data.contaComSolar) },
    { label: isUsina ? 'Custo oportunidade anual' : 'Custo anual', before: fmtCurrency(data.contaAtual * 12), after: fmtCurrency(data.contaComSolar * 12) },
    { label: isUsina ? 'Custo oportunidade (25 anos)' : 'Custo em 25 anos', before: fmtCurrency(data.custo25AnosSem), after: fmtCurrency(data.custo25AnosCom) },
    { label: isUsina ? 'Receita mensal estimada' : 'Economia mensal', before: '-', after: fmtCurrency(economiaMensal) },
    { label: isUsina ? 'Receita acumulada (25 anos)' : 'Economia em 25 anos', before: '-', after: fmtCurrency(economia25Anos) },
  ];

  const totalH = headerH + rows.length * rowH + 4;

  // Headers
  // "Sem Solar"
  setFill(doc, theme.red);
  doc.roundedRect(x, y, colW, headerH, 2, 2, 'F');
  doc.rect(x, y + headerH - 3, colW, 3, 'F');
  setTextC(doc, theme.white);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
  doc.text(isUsina ? 'Sem Usina' : 'Sem Solar', x + colW / 2, y + 7, { align: 'center' });

  // "Com Solar"
  setFill(doc, theme.green);
  doc.roundedRect(x + colW + 4, y, colW, headerH, 2, 2, 'F');
  doc.rect(x + colW + 4, y + headerH - 3, colW, 3, 'F');
  setTextC(doc, theme.white);
  doc.text(isUsina ? 'Com Usina' : 'Com Solar', x + colW + 4 + colW / 2, y + 7, { align: 'center' });

  // Rows
  rows.forEach((row, i) => {
    const ry = y + headerH + i * rowH;
    const isEven = i % 2 === 0;

    // Before col
    setFill(doc, isEven ? [255, 245, 245] as RGB : theme.white);
    doc.rect(x, ry, colW, rowH, 'F');
    setTextC(doc, theme.textLight);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(row.label, x + 3, ry + 4);
    setTextC(doc, theme.red);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text(row.before, x + colW - 3, ry + 4, { align: 'right' });

    // After col
    setFill(doc, isEven ? theme.primaryLight : theme.white);
    doc.rect(x + colW + 4, ry, colW, rowH, 'F');
    setTextC(doc, theme.textLight);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(row.label, x + colW + 4 + 3, ry + 4);
    setTextC(doc, theme.green);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text(row.after, x + colW + 4 + colW - 3, ry + 4, { align: 'right' });
  });

  return totalH;
}
