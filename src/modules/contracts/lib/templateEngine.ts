import contractBaseTemplate from '../../../../GERADOR DE CONTRATOS/contrato_base_solarzap_template_real_v2.md?raw';
import type {
  ContractCommercialSummary,
  ContractPlaceholderSnapshot,
  ContractRenderBlock,
  ContractRenderResult,
} from './domain';
import type { ContractFormalizationFormValues } from './schema';
import {
  formatBooleanPtBr,
  formatCurrencyPtBr,
  formatDatePtBr,
  formatFeatureFlag,
  formatForumLabel,
  normalizeText,
} from './formatters';

const repairMojibake = (value: string) => {
  if (!/[ÃÂ]/.test(value)) return value;

  try {
    const bytes = Uint8Array.from(Array.from(value).map((char) => char.charCodeAt(0)));
    const decoded = new TextDecoder('utf-8').decode(bytes);
    return decoded.includes('�') ? value : decoded;
  } catch {
    return value;
  }
};

const normalizedTemplate = repairMojibake(contractBaseTemplate)
  .replace(/\r\n/g, '\n')
  .trim();

const ANNEX_HEADINGS = {
  planA: '# ANEXO I',
  planB: '# ANEXO II',
  planC: '# ANEXO III',
  special: '# ANEXO IV',
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderInlineMarkdown = (value: string) => {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code class="rounded bg-slate-100 px-1.5 py-0.5 text-[0.88em]">$1</code>');
};

const extractSection = (source: string, startToken: string, endToken?: string) => {
  const startIndex = source.indexOf(startToken);
  if (startIndex < 0) return '';

  const endIndex = endToken ? source.indexOf(endToken, startIndex) : -1;
  return source
    .slice(startIndex, endIndex >= 0 ? endIndex : undefined)
    .trim();
};

const mainTemplateSection = (() => {
  const planIndex = normalizedTemplate.indexOf(ANNEX_HEADINGS.planA);
  return planIndex >= 0
    ? normalizedTemplate.slice(0, planIndex).trim()
    : normalizedTemplate;
})();

const annexTemplates = {
  plano_a: extractSection(
    normalizedTemplate,
    ANNEX_HEADINGS.planA,
    ANNEX_HEADINGS.planB,
  ),
  plano_b: extractSection(
    normalizedTemplate,
    ANNEX_HEADINGS.planB,
    ANNEX_HEADINGS.planC,
  ),
  plano_c: extractSection(
    normalizedTemplate,
    ANNEX_HEADINGS.planC,
    ANNEX_HEADINGS.special,
  ),
  special: extractSection(normalizedTemplate, ANNEX_HEADINGS.special),
};

const replacePlaceholders = (
  source: string,
  placeholders: ContractPlaceholderSnapshot,
) =>
  source.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) =>
    key in placeholders ? placeholders[key] : '',
  );

const toParagraphText = (lines: string[]) => normalizeText(lines.join(' '));

const parseContractBlocks = (markdown: string): ContractRenderBlock[] => {
  const blocks: ContractRenderBlock[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: 'unordered_list' | 'ordered_list' | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push({
      type: 'paragraph',
      content: toParagraphText(paragraphLines),
    });
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0 || !listType) return;
    blocks.push({
      type: listType,
      items: [...listItems],
    });
    listItems = [];
    listType = null;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      return;
    }

    if (line === '---') {
      flushParagraph();
      flushList();
      blocks.push({ type: 'divider' });
      return;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      blocks.push({
        type: level === 1 ? 'heading_1' : level === 2 ? 'heading_2' : 'heading_3',
        content: headingMatch[2].trim(),
      });
      return;
    }

    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      blocks.push({
        type: 'blockquote',
        content: line.slice(2).trim(),
      });
      return;
    }

    const unorderedMatch = line.match(/^-\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== 'unordered_list') flushList();
      listType = 'unordered_list';
      listItems.push(unorderedMatch[1].trim());
      return;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== 'ordered_list') flushList();
      listType = 'ordered_list';
      listItems.push(orderedMatch[1].trim());
      return;
    }

    flushList();
    paragraphLines.push(line);
  });

  flushParagraph();
  flushList();

  return blocks;
};

const renderBlocksToHtml = (blocks: ContractRenderBlock[]) => {
  const chunks = blocks.map((block) => {
    switch (block.type) {
      case 'heading_1':
        return `<h1 class="mt-10 text-2xl font-semibold tracking-tight text-slate-950 first:mt-0">${renderInlineMarkdown(
          block.content || '',
        )}</h1>`;
      case 'heading_2':
        return `<h2 class="mt-8 text-xl font-semibold tracking-tight text-slate-950">${renderInlineMarkdown(
          block.content || '',
        )}</h2>`;
      case 'heading_3':
        return `<h3 class="mt-6 text-base font-semibold uppercase tracking-[0.12em] text-slate-700">${renderInlineMarkdown(
          block.content || '',
        )}</h3>`;
      case 'blockquote':
        return `<blockquote class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">${renderInlineMarkdown(
          block.content || '',
        )}</blockquote>`;
      case 'unordered_list':
        return `<ul class="ml-5 list-disc space-y-2 text-[15px] leading-7 text-slate-700">${(block.items || [])
          .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
          .join('')}</ul>`;
      case 'ordered_list':
        return `<ol class="ml-5 list-decimal space-y-2 text-[15px] leading-7 text-slate-700">${(block.items || [])
          .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
          .join('')}</ol>`;
      case 'divider':
        return '<hr class="my-8 border-slate-200" />';
      case 'paragraph':
      default:
        return `<p class="text-[15px] leading-7 text-slate-700">${renderInlineMarkdown(
          block.content || '',
        )}</p>`;
    }
  });

  return [
    '<article class="mx-auto flex max-w-[880px] flex-col gap-4 rounded-[32px] border border-slate-200 bg-white px-6 py-8 shadow-[0_28px_60px_-42px_rgba(15,23,42,0.35)] sm:px-10 sm:py-12">',
    ...chunks,
    '</article>',
  ].join('');
};

const buildCommercialSummary = (
  values: ContractFormalizationFormValues,
): ContractCommercialSummary => {
  const { legalData } = values;
  return {
    contratanteNome: legalData.contratante.razaoSocial,
    responsavelNome: legalData.responsavel.nome,
    planoNome: legalData.plano.nome,
    planoCodigo: legalData.plano.codigo,
    valorImplantacao: legalData.pagamento.valorImplantacao,
    valorRecorrente: legalData.pagamento.valorRecorrente,
    dataInicio: legalData.pagamento.dataInicio,
    primeiroVencimento: legalData.pagamento.dataPrimeiroVencimento,
    diaVencimentoMensal: legalData.pagamento.diaVencimentoMensal,
    quantidadeReunioesImplantacao:
      legalData.plano.quantidadeReunioesImplantacao,
    suporteWhatsapp: legalData.plano.flags.suporteWhatsapp,
    landingPage: legalData.plano.flags.landingPage,
    reuniaoExtra: legalData.plano.flags.reuniaoExtra,
    acompanhamentoSemanal: legalData.plano.flags.acompanhamentoSemanal,
    treinamentoGravado: legalData.plano.flags.treinamentoGravado,
    solarZapMesUm: legalData.plano.flags.solarZapMesUm,
    trafegoPago: legalData.plano.flags.trafegoPago,
    condicaoEspecialAtiva: legalData.condicaoEspecial.ativa,
    descricaoCondicaoEspecial: legalData.condicaoEspecial.descricao,
    observacoesComerciais: legalData.condicaoEspecial.observacoesComerciais,
    foro: formatForumLabel(legalData.foro.cidade, legalData.foro.estado),
    plataformaAssinatura: legalData.assinatura.plataformaNome,
  };
};

export const buildContractPlaceholders = (
  values: ContractFormalizationFormValues,
): ContractPlaceholderSnapshot => {
  const { legalData, internalMetadata } = values;
  const plan = legalData.plano;
  const payment = legalData.pagamento;
  const recurrence = legalData.recorrencia;
  const special = legalData.condicaoEspecial;
  const companyAddress = legalData.contratante.endereco;

  return {
    contratante_razao_social: legalData.contratante.razaoSocial,
    contratante_nome_fantasia: legalData.contratante.nomeFantasia,
    contratante_cnpj: legalData.contratante.cnpj,
    contratante_endereco_logradouro: companyAddress.logradouro,
    contratante_endereco_numero: companyAddress.numero,
    contratante_endereco_complemento: companyAddress.complemento || 'sem complemento',
    contratante_bairro: companyAddress.bairro,
    contratante_cidade: companyAddress.cidade,
    contratante_estado: companyAddress.estado,
    contratante_cep: companyAddress.cep,
    responsavel_nome: legalData.responsavel.nome,
    responsavel_nacionalidade: legalData.responsavel.nacionalidade,
    responsavel_estado_civil: legalData.responsavel.estadoCivil,
    responsavel_profissao: legalData.responsavel.profissao,
    responsavel_cpf: legalData.responsavel.cpf,
    responsavel_rg: legalData.responsavel.rg,
    responsavel_cargo: legalData.responsavel.cargo,
    responsavel_email: legalData.responsavel.email,
    responsavel_telefone: legalData.responsavel.telefone,
    contratada_razao_social: legalData.contratada.razaoSocial,
    contratada_nome_fantasia: legalData.contratada.nomeFantasia,
    contratada_cnpj: legalData.contratada.cnpj,
    contratada_endereco: legalData.contratada.endereco,
    contratada_representante_nome: legalData.contratada.representanteNome,
    contratada_representante_cpf: legalData.contratada.representanteCpf,
    plano_codigo: plan.codigo,
    plano_nome: plan.nome,
    plano_valor_implantacao: formatCurrencyPtBr(payment.valorImplantacao),
    plano_valor_recorrente: formatCurrencyPtBr(payment.valorRecorrente),
    plano_qtd_reunioes_implantacao: String(plan.quantidadeReunioesImplantacao),
    plano_tem_suporte_whatsapp: formatFeatureFlag(plan.flags.suporteWhatsapp),
    plano_tem_reuniao_extra: formatFeatureFlag(plan.flags.reuniaoExtra),
    plano_tem_landing_page: formatFeatureFlag(plan.flags.landingPage),
    plano_tem_treinamento_gravado: formatFeatureFlag(
      plan.flags.treinamentoGravado,
    ),
    plano_tem_solarzap_1_mes: formatFeatureFlag(plan.flags.solarZapMesUm),
    plano_tem_acompanhamento_semanal: formatFeatureFlag(
      plan.flags.acompanhamentoSemanal,
    ),
    plano_tem_trafego_pago: formatFeatureFlag(plan.flags.trafegoPago),
    data_assinatura: formatDatePtBr(payment.dataAssinatura),
    data_inicio: formatDatePtBr(payment.dataInicio),
    vigencia_inicial_meses: String(recurrence.vigenciaInicialMeses),
    data_primeiro_vencimento: formatDatePtBr(payment.dataPrimeiroVencimento),
    dia_vencimento_mensal: String(payment.diaVencimentoMensal),
    forma_pagamento_implantacao: payment.formaPagamentoImplantacao,
    forma_pagamento_recorrencia: payment.formaPagamentoRecorrencia,
    prazo_cancelamento_dias: String(recurrence.prazoCancelamentoDias),
    prazo_exportacao_dados_dias: String(recurrence.prazoExportacaoDadosDias),
    multa_inadimplencia_percentual: `${recurrence.multaInadimplenciaPercentual}%`,
    juros_inadimplencia_percentual: `${recurrence.jurosInadimplenciaPercentual}%`,
    tem_condicao_especial: formatBooleanPtBr(special.ativa),
    descricao_condicao_especial: special.ativa
      ? special.descricao
      : 'Nao se aplica',
    observacoes_comerciais:
      special.observacoesComerciais || 'Sem observacoes comerciais adicionais.',
    plataforma_assinatura_nome: legalData.assinatura.plataformaNome,
    url_plataforma_assinatura: legalData.assinatura.plataformaUrl,
    foro_cidade: legalData.foro.cidade,
    foro_estado: legalData.foro.estado,
    contract_number: internalMetadata.contractNumber,
    template_version: internalMetadata.templateVersion,
  };
};

export const renderContractDocument = (
  values: ContractFormalizationFormValues,
): ContractRenderResult => {
  const placeholders = buildContractPlaceholders(values);
  const summary = buildCommercialSummary(values);
  const selectedPlanAnnex = annexTemplates[values.legalData.plano.codigo];
  const specialAnnex = values.legalData.condicaoEspecial.ativa
    ? annexTemplates.special
    : '';

  const mergedMarkdown = [
    replacePlaceholders(mainTemplateSection, placeholders),
    replacePlaceholders(selectedPlanAnnex, placeholders),
    specialAnnex ? replacePlaceholders(specialAnnex, placeholders) : '',
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');

  const blocks = parseContractBlocks(mergedMarkdown);
  const html = renderBlocksToHtml(blocks);

  return {
    markdown: mergedMarkdown,
    html,
    blocks,
    placeholders,
    commercialSummary: summary,
    includedAnnexes: [
      values.legalData.plano.codigo,
      ...(values.legalData.condicaoEspecial.ativa ? ['special'] : []),
    ],
  };
};
