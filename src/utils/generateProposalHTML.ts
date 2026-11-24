import template from '../../solarzap-proposta/index.html?raw';
import styles from '../../solarzap-proposta/style.css?raw';
import interactions from '../../solarzap-proposta/app.js?raw';
import { PAYMENT_CONDITION_LABEL_BY_ID } from '@/types/proposalFinancing';
import { calcMonthlyGeneration } from '@/utils/proposalCharts';
import { calcEnvironmentalImpactFromAnnualKwh } from '@/utils/environmentalImpact';
import { calcPMT } from '@/utils/financingCalc';
import { normalizePhoneE164 } from '@/lib/phoneUtils';
import type { ProposalPDFData } from '@/utils/generateProposalPDF';

type PageData = ProposalPDFData & {
  companyName?: string;
  commercialWhatsApp?: string;
  issuedAt: Date;
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const units = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const money = (n: number) => currency.format(n);

const photoUrls = {
  'assets/telhados.webp': new URL('../../solarzap-proposta/assets/telhados.webp', import.meta.url).href,
  'assets/projeto-aereo.webp': new URL('../../solarzap-proposta/assets/projeto-aereo.webp', import.meta.url).href,
  'assets/projeto-residencial.webp': new URL('../../solarzap-proposta/assets/projeto-residencial.webp', import.meta.url).href,
};

async function embedPhoto(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível carregar as imagens da proposta.');
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const isEmbeddedImage = (value: string | null | undefined): value is string =>
  /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/i.test(value || '');

export async function generateProposalHTML(data: PageData): Promise<string> {
  const doc = new DOMParser().parseFromString(template, 'text/html');
  const node = (selector: string) => {
    const element = doc.querySelector(selector);
    if (!element) throw new Error('Elemento ausente no modelo da proposta: ' + selector);
    return element;
  };
  const each = (selector: string, values: string[]) =>
    doc.querySelectorAll(selector).forEach((element, i) => { element.textContent = values[i] ?? ''; });
  const set = (selector: string, value: string) => { node(selector).textContent = value; };
  const count = (selector: string, value: number, formatted: string) => {
    doc.querySelectorAll(selector).forEach((element) => {
      element.setAttribute('data-count', String(value));
      element.textContent = formatted;
    });
  };
  const setHeight = (element: Element, ratio: number) =>
    element.setAttribute('style', '--h:' + (ratio * 100) + '%');
  const company = data.signatureCompanyName || data.companyName || 'Energia solar';
  const who = data.signatureContractorName || data.contact.name || 'Cliente';
  const code = data.propNum || 'Proposta';
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(data.issuedAt);
  const days = data.validadeDias || 15;
  const validity = days + (days === 1 ? ' dia corrido' : ' dias corridos');
  const isPlant = data.tipo_cliente === 'usina';
  const segment = data.premiumContent?.segmentLabel || 'Energia solar';
  const financial = data.financialOutputs;
  const inputs = data.financialInputs;
  const before = data.contaLuzMensal || financial?.billBeforeMonthly || data.consumoMensal * (inputs?.tarifaKwh ?? 0);
  const savings = Math.min(before, Math.max(0, financial?.savingsMonthly ?? (before - (financial?.billAfterMonthly ?? before))));
  const after = before - savings;
  const percent = before > 0 ? Math.min(100, savings / before * 100) : 0;
  const monthlyReturn = financial?.monthlyRevenueYear1 ?? data.economiaAnual / 12;
  const series = [0, ...(financial?.cumulativeRevenueSeries || [])];
  const years = series.length - 1 || 25;
  const cumulative = series[series.length - 1];
  const annual = financial?.annualRevenueYear1 ?? data.economiaAnual;
  const annualKwh = financial?.annualGenerationKwhYear1 ?? 0;
  const averageKwh = annualKwh / 12;
  const investment = data.investimentoBaseMetricas ?? data.valorTotal;
  const cash = data.valorAvistaLiquido ?? data.valorTotal;
  const payback = financial?.paybackMonths ? financial.paybackLabelYearsMonths : 'Fora do horizonte projetado';
  const roi = financial?.roi25Pct ?? 0;
  const returnLabel = isPlant ? 'Receita' : 'Economia';
  const warranty = (value?: number) => value ? value + (value === 1 ? ' ano' : ' anos') : 'Consulte as condições';
  const warranties = 'Módulo: ' + warranty(data.moduloGarantia) + ' · Inversor: ' + warranty(data.inversorGarantia) + ' · Serviços: ' + warranty(data.garantiaAnos);

  doc.title = code + ' | ' + company;
  doc.documentElement.dataset.proposalNumber = code;
  doc.documentElement.dataset.commercialWhatsapp = normalizePhoneE164(data.commercialWhatsApp) || '';
  doc.documentElement.dataset.total = money(data.valorTotal);
  doc.documentElement.dataset.series = JSON.stringify(series);
  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
  doc.head.prepend(csp);
  const robots = doc.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow';
  doc.head.append(robots);
  doc.querySelectorAll('.brand, .print-brand').forEach((element) => {
    element.replaceChildren();
    if (isEmbeddedImage(data.logoDataUrl)) {
      const logo = doc.createElement('img');
      logo.src = data.logoDataUrl;
      logo.alt = '';
      element.append(logo);
    }
    element.append(company);
  });

  each('.hero-meta span', [data.contact.city || data.contact.state || 'Projeto solar', date, code]);
  set('.panel-top span:last-child', segment);
  each('.proposal-details strong', [who, [data.contact.city, segment].filter(Boolean).join(' · '), code, validity]);
  set('footer .footer-inner > span', code + ' · ' + date);
  each('.signature-grid strong', [who, company]);
  each('.signature-grid small', ['', '']);
  set('.editorial-copy details p', warranties);
  if (data.premiumContent?.executiveSummary) set('.editorial-copy p', data.premiumContent.executiveSummary);
  set('.editorial-photo > span', 'ENERGIA SOLAR');
  set('.system-photo-caption', 'PROJETO ' + segment.toLocaleUpperCase('pt-BR'));
  doc.querySelectorAll('.system-photo img, .editorial-photo img').forEach((image) => image.setAttribute('alt', 'Instalação fotovoltaica ilustrativa'));

  each('h1 .loss-text, .closing h2 .loss-text', [money(before), money(before)]);
  count('.hero-number, .kpi.highlight strong', isPlant ? monthlyReturn : savings, money(isPlant ? monthlyReturn : savings));
  set('.panel-caption', decimal.format(percent) + '% de redução estimada na conta mensal.');
  node('.meter span').setAttribute('style', 'width:' + percent + '%');
  each('.meter-label span', [decimal.format(percent) + '% de redução estimada', decimal.format(100 - percent) + '% restante']);
  each('.mini-compare strong, .kpi-grid .kpi:not(.highlight) strong', [money(before), money(after), money(before), money(after)]);
  set('.loss-main > strong', money(before * 12 * years));
  each('.loss-side b', [money(before), money(before * 12)]);
  set('.loss-kicker', 'SEM SOLAR / EM ' + years + ' ANOS');
  const billMax = Math.max(before, after, 1) * 1.15;
  each('.bill-axis span', [1, 2 / 3, 1 / 3, 0].map((ratio) => money(billMax * ratio)));
  each('.bill-bar b', [money(before), money(after)]);
  setHeight(node('.bill-bar.old'), before / billMax);
  setHeight(node('.bill-bar.new'), after / billMax);
  node('.bill-chart').setAttribute('aria-label', 'Conta antes ' + money(before) + ' e com solar ' + money(after));
  set('#retorno .chart-footer strong', money(savings) + '/mês');
  each('#retorno tbody td', [money(before), money(after), money(before * 12), money(after * 12), '—', money(savings)]);
  each('.closing tbody td', [
    money(before), money(after), money(before * 12), money(after * 12),
    money(before * 12 * years), money(before * 12 * years - cumulative),
    '—', money(savings), '—', money(cumulative),
  ]);
  set('.closing tbody tr:last-child th', 'Economia em ' + years + ' anos');
  set('.closing tbody tr:nth-child(3) th', 'Custo em ' + years + ' anos');
  for (const [selector, value] of [['.decision-loss strong', before], ['.decision-gain strong', after]] as const) {
    const period = doc.createElement('span');
    period.textContent = ' /mês';
    node(selector).replaceChildren(money(value), period);
  }
  set('.decision-loss p', money(before * 12 * years) + ' em ' + years + ' anos, mantendo a conta atual constante.');
  set('.decision-gain p', 'Economia estimada de ' + money(savings) + ' por mês após a ativação.');
  node('.financial-note').remove();
  if (isPlant) {
    set('.nav nav a:first-child', 'Receita');
    set('.hero h1', 'Transforme a geração solar em receita.');
    set('.hero-copy > p', 'Conheça a usina dimensionada e acompanhe a projeção de receita ao longo dos anos.');
    set('.hero-copy > .btn', 'Explore a projeção ↓');
    set('.hero-foot > span', 'PROJEÇÃO DE GERAÇÃO E RECEITA');
    set('.panel-label', 'Receita mensal estimada');
    set('.panel-caption', 'Estimativa média no primeiro ano de operação.');
    doc.querySelectorAll('.meter, .meter-label, .mini-compare, #retorno, .decision-contrast, .closing .compare').forEach((element) => element.remove());
    set('#economia h2', 'Receita gerada pelo sol.');
    set('#economia .section-heading p', 'Veja a geração e a receita estimadas do projeto.');
    set('.kpi:first-child .tag', 'GERAÇÃO MÉDIA');
    set('.kpi:first-child strong', units.format(averageKwh) + ' kWh');
    set('.kpi:first-child small', 'por mês');
    set('.kpi:nth-child(2) .tag', 'RECEITA ANUAL ESTIMADA');
    set('.kpi:nth-child(2) strong', money(annual));
    set('.kpi:nth-child(2) small', 'no primeiro ano');
    set('.kpi.highlight .tag', 'RECEITA MENSAL ESTIMADA');
    set('.kpi.highlight small', 'média no primeiro ano');
    set('.editorial-copy h3', 'Geração de energia ao longo dos anos.');
    set('.editorial-copy p:nth-of-type(2)', 'Projeção baseada nas premissas de geração e remuneração da proposta.');
    set('#geracao h2', 'Sol o ano inteiro. Geração em movimento.');
    set('.timeline article:last-child p', 'Usina ativa e gerando energia a partir da aprovação da concessionária.');
    set('.closing h2', 'Investimento para gerar sua própria energia.');
    set('.closing .section-heading p', 'Confira as condições comerciais e a projeção de retorno.');
    set('.closing-action h3', 'Escolha como quer pagar.');
  }
  if (data.premiumContent?.headline) set('.editorial-copy h3', data.premiumContent.headline);

  count('.system-power strong', data.potenciaSistema, decimal.format(data.potenciaSistema));
  set('.system-content > p', 'Potência instalada · ' + units.format(data.quantidadePaineis) + ' módulos' + (data.moduloPotencia ? ' de ' + data.moduloPotencia + ' W' : ''));
  each('.system-spec strong', [
    units.format(isPlant ? averageKwh : data.consumoMensal), units.format(averageKwh), units.format(annualKwh), warranty(data.garantiaAnos),
  ]);
  if (isPlant) node('.system-spec > div:first-child').remove();
  each('.kit h4', [
    data.moduloMarca || 'Módulos fotovoltaicos', data.inversorMarca || 'Inversor solar', data.estruturaTipo || 'Estrutura de fixação', 'Instalação completa',
  ]);
  each('.kit p', [
    [data.moduloNome, data.moduloPotencia && data.moduloPotencia + ' W', data.moduloTipo].filter(Boolean).join(' · '),
    [data.inversorNome, data.inversorPotencia && data.inversorPotencia + ' kW', data.inversorTensao].filter(Boolean).join(' · '),
    'Estrutura conforme vistoria técnica.', 'Projeto, instalação e homologação.',
  ]);
  each('.kit small', [
    '01 / MÓDULOS · ' + data.quantidadePaineis + ' UN.', '02 / INVERSOR' + (data.inversorQtd ? ' · ' + data.inversorQtd + ' UN.' : ''),
    '03 / ESTRUTURA', '04 / SERVIÇOS',
  ]);
  each('.kit-foot', [warranty(data.moduloGarantia), warranty(data.inversorGarantia), 'Conforme vistoria técnica', warranty(data.garantiaAnos)]);
  const monthly = calcMonthlyGeneration(isPlant ? 0 : data.potenciaSistema, isPlant ? averageKwh : data.consumoMensal, inputs);
  const monthMax = Math.max(1, averageKwh, ...monthly);
  each('.month-axis span', [1, .75, .5, .25, 0].map((ratio) => units.format(monthMax * ratio)));
  each('.month-bar b', monthly.map((value) => units.format(value)));
  doc.querySelectorAll('.month').forEach((element, i) => setHeight(element, monthly[i] / monthMax));
  node('.avg-line').setAttribute('style', 'bottom:' + (averageKwh / monthMax * 100) + '%');
  set('.avg-line span', 'Média: ' + units.format(averageKwh));
  each('.generation .growth-value strong, .generation .chart-footer strong', [units.format(annualKwh) + ' kWh', units.format(averageKwh) + ' kWh']);
  const impact = calcEnvironmentalImpactFromAnnualKwh(annualKwh, years);
  each('.impact-stats strong', [decimal.format(impact.co2Tons) + ' t', units.format(impact.trees), units.format(impact.carKm) + ' km']);
  each('.impact-stats small', ['CO₂ evitado', 'Árvores equivalentes', 'Quilômetros de carro evitados']);
  set('.impact .eyebrow', 'IMPACTO AMBIENTAL / ' + years + ' ANOS');

  const paymentIds = data.paymentConditions || [];
  const options = paymentIds.filter((id) => id !== 'financiamento_bancario' || !data.showFinancingSimulation)
    .map((id) => ({
      label: PAYMENT_CONDITION_LABEL_BY_ID[id],
      amount: ['pix_avista', 'boleto_avista', 'ted_avista'].includes(id) ? cash : undefined,
      installment: false,
    }));
  const financingTemplate = node('.payment:not(.featured)').cloneNode(true) as Element;
  doc.querySelectorAll('.payment:not(.featured)').forEach((element) => element.remove());
  if (paymentIds.includes('financiamento_bancario') && data.showFinancingSimulation) {
    for (const bank of data.financingConditions || []) {
      for (const term of bank.installments) {
        const payment = calcPMT(bank.interestRateMonthly, term, data.valorTotal);
        if (!Number.isFinite(payment) || payment <= 0) continue;
        const label = bank.institutionName + ' · ' + term + 'x';
        options.push({ label, amount: payment, installment: true });
        const card = financingTemplate.cloneNode(true) as Element;
        card.querySelector('small')!.textContent = label;
        card.querySelector('strong')!.textContent = money(payment);
        card.querySelector('p')!.textContent = (bank.gracePeriodValue || 0) + ' ' + bank.gracePeriodUnit + ' de carência';
        if (isPlant) card.querySelector('.installment-comparison')?.remove();
        else {
          const [total, difference] = card.querySelectorAll('.installment-comparison b');
          const monthlyCost = payment + after;
          const delta = before - monthlyCost;
          total.textContent = money(monthlyCost) + '/mês';
          difference.textContent = money(Math.abs(delta)) + (delta >= 0 ? '/mês a menos' : '/mês a mais');
        }
        node('.payment-grid').append(card);
      }
    }
    if (!options.some((option) => option.installment)) options.push({
      label: PAYMENT_CONDITION_LABEL_BY_ID.financiamento_bancario, amount: undefined, installment: false,
    });
  }
  set('.payment.featured small', cash < data.valorTotal ? 'VALOR À VISTA COM DESCONTO' : 'INVESTIMENTO TOTAL');
  set('.payment.featured strong', money(cash));
  set('.payment.featured p', cash < data.valorTotal ? 'Valor cheio: ' + money(data.valorTotal) : 'Investimento total do sistema.');
  const methods = paymentIds.map((id) => PAYMENT_CONDITION_LABEL_BY_ID[id]);
  node('.payment-methods').replaceChildren(...methods.map((label) => {
    const span = doc.createElement('span');
    span.textContent = label;
    return span;
  }));
  set('.closing-first > .closing-note', options.some((option) => option.installment) ? 'Simulações comerciais sujeitas à análise de crédito.' : '');
  const terms = node('#etapas details:last-child');
  const termsList = terms.querySelectorAll('li');
  termsList[0].textContent = 'Validade de ' + validity + ' a partir da emissão.';
  termsList[1].textContent = isPlant ? 'Geração estimada sujeita a vistoria técnica.' : 'Estimativa baseada no consumo de ' + units.format(data.consumoMensal) + ' kWh/mês, sujeita a vistoria técnica.';
  if (isPlant) termsList[3].textContent = 'A receita pode variar conforme geração e condições de remuneração.';
  termsList[4].textContent = warranties;
  termsList[6].remove();
  termsList[7].textContent = methods.join(' · ');
  if (!paymentIds.includes('financiamento_bancario')) termsList[8].remove();
  set('.closing-action p', 'Proposta válida por ' + validity + ' a partir da emissão.');
  set('#approval-form .eyebrow', code + ' / ACEITE COMERCIAL');
  set('.approval-total strong', money(data.valorTotal));
  set('.print-decision span', options.map((option) => '□ ' + option.label).join('   '));
  const fieldset = node('.payment-options');
  fieldset.querySelectorAll('label').forEach((label) => label.remove());
  for (const option of options) {
    const label = doc.createElement('label');
    const radio = doc.createElement('input');
    radio.type = 'radio';
    radio.name = 'payment';
    radio.required = true;
    radio.value = option.label + (option.amount !== undefined ? ' · ' + money(option.amount) : '');
    const name = doc.createElement('span');
    name.textContent = option.label;
    label.append(radio, name);
    if (option.amount !== undefined) {
      const amount = doc.createElement('b');
      amount.textContent = money(option.amount) + (option.installment ? '*' : '');
      label.append(amount);
    }
    fieldset.append(label);
  }
  if (!options.some((option) => option.installment)) node('#approval-form > .fine:not(#send-status)').remove();
  if (!options.length) node('#approve').remove();

  each('.return-summary small', ['RETORNO ESTIMADO', returnLabel.toUpperCase() + ' ANUAL ESTIMADA', returnLabel.toUpperCase() + ' MENSAL ESTIMADA', 'ROI EM ' + years + ' ANOS']);
  each('.return-summary strong', [payback, money(annual), money(monthlyReturn), decimal.format(roi) + '%']);
  const gain = Math.max(0, cumulative - investment);
  const share = gain + investment > 0 ? Math.round(gain / (gain + investment) * 100) : 0;
  set('.donut strong', decimal.format(roi) + '%');
  set('.donut small', 'ROI ' + years + ' anos');
  node('.donut svg').setAttribute('aria-label', share + '% retorno, ' + (100 - share) + '% investimento');
  node('.donut-fill').setAttribute('stroke-dasharray', share + ' ' + (100 - share));
  each('.roi-legend strong', [money(gain), money(investment)]);
  each('.roi-legend small', [share + '%', (100 - share) + '%']);
  set('.closing-second .chart-card .chart-head small', 'PROJEÇÃO EM ' + years + ' ANOS');
  set('.closing-second .chart-footer strong', money(financial?.retornoPorReal ?? 0));
  set('.growth h3', returnLabel + ' acumulada em ' + years + ' anos');
  set('.growth .fine', 'Projeção baseada nas premissas financeiras desta proposta.');
  const plotMax = Math.max(1, investment, ...series) * 1.1;
  const y = (value: number) => 230 - value / plotMax * 220;
  const plot = series.map((value, i) => [i / years * 760, y(value)]);
  const line = plot.map(([x, height], i) => (i ? 'L' : 'M') + x + ' ' + height).join(' ');
  const chart = node('.growth-chart svg');
  chart.setAttribute('aria-label', returnLabel + ' acumulada em ' + years + ' anos: ' + money(cumulative));
  node('.growth-line').setAttribute('d', line);
  node('.growth-chart path[fill="url(#area)"]').setAttribute('d', line + ' L760 230Z');
  node('.growth-chart path[stroke="#da2638"]').setAttribute('d', 'M0 ' + y(investment) + 'H760');
  const paybackMarker = node('.growth-chart path[stroke="#9b648c"]');
  const paybackDot = node('.growth-chart circle[fill="#9b648c"]');
  if (financial?.paybackMonths && financial.paybackMonths <= years * 12) {
    const x = financial.paybackMonths / (years * 12) * 760;
    paybackMarker.setAttribute('d', 'M' + x + ' 10V230');
    paybackDot.setAttribute('cx', String(x));
    paybackDot.setAttribute('cy', String(y(investment)));
  } else {
    paybackMarker.remove();
    paybackDot.remove();
  }
  doc.documentElement.dataset.plot = JSON.stringify(plot);
  each('.growth-axis span', [1, .75, .5, .25, 0].map((ratio) => money(plotMax * ratio)));
  each('.growth-x span', [0, .2, .4, .6, .8, 1].map((ratio) => String(Math.round(years * ratio)) + (ratio === 1 ? ' anos' : '')));
  each('.growth-key span', ['Payback: ' + payback, 'Investimento: ' + money(investment)]);
  node('#year-range').setAttribute('max', String(years));
  node('#year-range').setAttribute('value', String(years));
  set('#year-label', String(years));
  set('#year-output', years + ' anos');
  set('#year-value', money(cumulative));

  const covers = (data.coverImageDataUrls || []).filter(isEmbeddedImage);
  const photos = Object.fromEntries(await Promise.all(Object.entries(photoUrls).map(async ([path, url], i) =>
    [path, covers[i] || await embedPhoto(url)])));
  doc.querySelectorAll('img[src^="assets/"]').forEach((image) => {
    image.setAttribute('src', photos[image.getAttribute('src')!]);
  });
  const css = doc.createElement('style');
  const accent = data.colorTheme?.primary;
  css.textContent = styles.replace(/assets\/[\w-]+\.webp/g, (path) => photos[path]) +
    (accent?.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255) ? '\n:root{--green:rgb(' + accent.join(',') + ')}' : '');
  node('link[rel="stylesheet"]').replaceWith(css);
  const script = doc.createElement('script');
  script.textContent = interactions;
  node('script[src]').remove();
  doc.body.append(script);
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}
