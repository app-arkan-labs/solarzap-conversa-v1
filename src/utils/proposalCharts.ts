// ══════════════════════════════════════════════════════════
// Proposal Charts — Native jsPDF + Canvas drawing for PDF
// Draws charts directly into jsPDF documents using drawing
// primitives and optional offscreen canvas for complex shapes.
// ══════════════════════════════════════════════════════════
import jsPDF from 'jspdf';

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
// 2) AREA CHART: Cumulative Savings Over 25 Years
// ══════════════════════════════════════════════════════════
export function drawCumulativeSavingsChart(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  data: { valorTotal: number; economiaMensal: number; paybackMeses: number },
  theme: ChartTheme = DEFAULT_CHART_THEME,
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
  doc.text('Economia Acumulada em 25 Anos', x + w / 2, y + 10, { align: 'center' });

  const baseY = y + padding.top + chartH;
  const baseX = x + padding.left;
  const totalYears = 25;
  const econAnual = data.economiaMensal * 12;
  const maxSavings = econAnual * totalYears;
  const maxY = Math.max(maxSavings, data.valorTotal) * 1.1;

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
      const savings = econAnual * yr;
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

    // Draw line on top
    ctx.beginPath();
    for (let yr = 0; yr <= totalYears; yr++) {
      const savings = econAnual * yr;
      const px = (yr / totalYears) * cW;
      const py = cH - (savings / maxY) * cH;
      if (yr === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = `rgb(${theme.primary[0]}, ${theme.primary[1]}, ${theme.primary[2]})`;
    ctx.lineWidth = 3 * dpr;
    ctx.stroke();

    // Payback marker
    const paybackYears = data.paybackMeses / 12;
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
  const paybackYears = data.paybackMeses / 12;
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
  setFill(doc, theme.primaryLight);
  const totalText = `Economia total: ${fmtCurrencyShort(maxSavings)} em 25 anos`;
  const tw = doc.getTextWidth(totalText) + 8;
  doc.roundedRect(x + w / 2 - tw / 2, baseY + 14, tw, 7, 2, 2, 'F');
  setTextC(doc, theme.primary);
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

  const total = data.valorTotal + data.retornoLiquido;
  const investPct = data.valorTotal / total;
  const retornoPct = data.retornoLiquido / total;

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
    ctx.fillStyle = `rgb(${theme.primary[0]}, ${theme.primary[1]}, ${theme.primary[2]})`;
    ctx.fill();

    // Investimento slice
    ctx.beginPath();
    ctx.moveTo(cr, cr);
    ctx.arc(cr, cr, r, retornoEnd, startAngle + Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = `rgb(${theme.accent[0]}, ${theme.accent[1]}, ${theme.accent[2]})`;
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
  const roiPct = data.retornoLiquido > 0
    ? `${((data.retornoLiquido / data.valorTotal) * 100).toFixed(0)}%`
    : '-';
  setTextC(doc, theme.text);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text(roiPct, cx, cy + 1, { align: 'center' });
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
  doc.text('ROI 25 anos', cx, cy + 5, { align: 'center' });

  // Legend (right side)
  const lx = x + w * 0.6;
  const ly = cy - 10;

  setFill(doc, theme.primary);
  doc.rect(lx, ly, 4, 4, 'F');
  setTextC(doc, theme.text);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text(`Retorno: ${fmtCurrencyShort(data.retornoLiquido)}`, lx + 6, ly + 3.5);
  doc.text(`(${(retornoPct * 100).toFixed(0)}%)`, lx + 6, ly + 8);

  setFill(doc, theme.accent);
  doc.rect(lx, ly + 14, 4, 4, 'F');
  doc.text(`Investimento: ${fmtCurrencyShort(data.valorTotal)}`, lx + 6, ly + 17.5);
  doc.text(`(${(investPct * 100).toFixed(0)}%)`, lx + 6, ly + 22);

  // Summary line
  setTextC(doc, theme.primary);
  doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  doc.text(
    `Para cada R$ 1 investido, voce recupera R$ ${(data.retornoLiquido / data.valorTotal + 1).toFixed(1)}`,
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
      label: 'CO\u2082 evitado',
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

    // Icon symbol (text-based)
    setTextC(doc, theme.white);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    const icon = i === 0 ? 'CO\u2082' : i === 1 ? '\u2741' : '\u2699';
    doc.text(icon, cx, iy + 1.5, { align: 'center' });

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
export const BRAZIL_MONTHLY_IRRADIATION_FACTOR = [
  0.95, 0.92, 0.98, 1.00, 1.02, 0.96,
  1.00, 1.05, 1.08, 1.10, 1.02, 0.92,
];
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function calcMonthlyGeneration(potenciaKwp: number): number[] {
  // Average daily irradiation in Brazil: ~4.5 kWh/m²/day
  // Performance ratio: ~0.8 for residential systems
  // Monthly = kWp × irradiation × 30 × PR × monthly factor
  const avgDaily = 4.5;
  const pr = 0.80;
  return BRAZIL_MONTHLY_IRRADIATION_FACTOR.map(
    (f) => Math.round(potenciaKwp * avgDaily * 30 * pr * f),
  );
}

export function drawMonthlyGenerationChart(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  monthlyKwh: number[],
  theme: ChartTheme = DEFAULT_CHART_THEME,
) {
  const padding = { top: 18, bottom: 18, left: 8, right: 8 };
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

  const maxKwh = Math.max(...monthlyKwh) * 1.15;
  const baseY = y + padding.top + chartH;
  const baseX = x + padding.left;
  const barW = (chartW / 12) * 0.7;
  const barGap = (chartW / 12) * 0.3;

  // Grid lines
  doc.setLineWidth(0.1);
  setDraw(doc, theme.gridLine);
  for (let i = 1; i <= 3; i++) {
    const gy = baseY - (chartH / 3) * i;
    doc.line(baseX, gy, baseX + chartW, gy);
  }

  monthlyKwh.forEach((kwh, i) => {
    const bx = baseX + (chartW / 12) * i + barGap / 2;
    const bh = (kwh / maxKwh) * chartH;

    // Gradient effect: use two rects (darker bottom, lighter top)
    const halfH = bh / 2;
    setFill(doc, theme.primary);
    doc.roundedRect(bx, baseY - bh, barW, bh, 1, 1, 'F');
    // Lighter overlay on top half
    setFill(doc, [
      Math.min(255, theme.primary[0] + 30),
      Math.min(255, theme.primary[1] + 30),
      Math.min(255, theme.primary[2] + 30),
    ] as RGB);
    doc.roundedRect(bx, baseY - bh, barW, halfH, 1, 1, 'F');

    // Value on top
    setTextC(doc, theme.text);
    doc.setFontSize(5.5); doc.setFont('helvetica', 'bold');
    doc.text(`${kwh}`, bx + barW / 2, baseY - bh - 2, { align: 'center' });

    // Month label
    setTextC(doc, theme.textLight);
    doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
    doc.text(MONTH_LABELS[i], bx + barW / 2, baseY + 4, { align: 'center' });
  });

  // Average line
  const avg = monthlyKwh.reduce((a, b) => a + b, 0) / 12;
  const avgY = baseY - (avg / maxKwh) * chartH;
  setDraw(doc, theme.accent);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([2, 1.5], 0);
  doc.line(baseX, avgY, baseX + chartW, avgY);
  doc.setLineDashPattern([], 0);
  setTextC(doc, theme.accent);
  doc.setFontSize(6); doc.setFont('helvetica', 'bold');
  doc.text(`Media: ${Math.round(avg)} kWh`, baseX + chartW, avgY - 2, { align: 'right' });

  // Total annual
  const totalAnual = monthlyKwh.reduce((a, b) => a + b, 0);
  setTextC(doc, theme.primary);
  doc.setFontSize(7); doc.setFont('helvetica', 'bold');
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
): number {
  const colW = (w - 4) / 2;
  const rowH = 10;
  const headerH = 10;

  // IDENTITY: custo_sem = custo_com + economia (must hold at every time horizon)
  const economiaMensal = data.contaAtual - data.contaComSolar;
  const economia25Anos = data.custo25AnosSem - data.custo25AnosCom;
  const rows = [
    { label: 'Conta mensal', before: fmtCurrency(data.contaAtual), after: fmtCurrency(data.contaComSolar) },
    { label: 'Custo anual', before: fmtCurrency(data.contaAtual * 12), after: fmtCurrency(data.contaComSolar * 12) },
    { label: 'Custo em 25 anos', before: fmtCurrency(data.custo25AnosSem), after: fmtCurrency(data.custo25AnosCom) },
    { label: 'Economia mensal', before: '-', after: fmtCurrency(economiaMensal) },
    { label: 'Economia em 25 anos', before: '-', after: fmtCurrency(economia25Anos) },
  ];

  const totalH = headerH + rows.length * rowH + 4;

  // Headers
  // "Sem Solar"
  setFill(doc, theme.red);
  doc.roundedRect(x, y, colW, headerH, 2, 2, 'F');
  doc.rect(x, y + headerH - 3, colW, 3, 'F');
  setTextC(doc, theme.white);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
  doc.text('Sem Solar', x + colW / 2, y + 7, { align: 'center' });

  // "Com Solar"
  setFill(doc, theme.green);
  doc.roundedRect(x + colW + 4, y, colW, headerH, 2, 2, 'F');
  doc.rect(x + colW + 4, y + headerH - 3, colW, 3, 'F');
  setTextC(doc, theme.white);
  doc.text('Com Solar', x + colW + 4 + colW / 2, y + 7, { align: 'center' });

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
