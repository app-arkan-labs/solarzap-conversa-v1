const CONTRACT_TEMPLATE_VERSION = 'solarzap_contract_real_v2';

type ContractPlanCode = 'plano_a' | 'plano_b' | 'plano_c';

export type ContractEmbedPrefill = {
  empresaNome?: string;
  empresaRazaoSocial?: string;
  cnpj?: string;
  responsavelNome?: string;
  responsavelEmail?: string;
  responsavelTelefone?: string;
  planoSugerido?: ContractPlanCode;
  condicaoEspecialAtiva?: boolean;
  condicaoEspecialDescricao?: string;
  sellerUserId?: string;
  salesSessionId?: string;
  lockFields?: string[];
};

type BuildDefaultsInput = {
  draftId: string;
  contractNumber: string;
  orgId: string;
  sellerUserId: string;
  leadId?: string | null;
  opportunityId?: string | null;
  allowedOrigin: string;
  prefill?: ContractEmbedPrefill | null;
};

const asString = (value: unknown, max = 1200): string =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const asBoolean = (value: unknown): boolean => value === true;

const envString = (key: string, fallback: string): string => {
  const plain = asString(Deno.env.get(key), 255);
  const vite = asString(Deno.env.get(`VITE_${key}`), 255);
  return plain || vite || fallback;
};

const createChecksumHash = (input: unknown) => {
  const text = JSON.stringify(input);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return `chk-${Math.abs(hash)}`;
};

const createEventId = () => crypto.randomUUID();

const todayIso = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildPlanSnapshot = (
  planCode: ContractPlanCode,
  values?: {
    valorImplantacao?: number;
    valorRecorrente?: number;
    quantidadeReunioesImplantacao?: number;
    includeReuniaoExtra?: boolean;
    includeLandingPage?: boolean;
  },
) => {
  const definitions = {
    plano_a: {
      codigo: 'plano_a',
      nome: 'Plano Essencial / Downsell',
      quantidadeReunioesImplantacao: 0,
      descricaoObjetiva:
        'Implantacao mais enxuta, com escopo controlado e sem acompanhamento semanal recorrente.',
      itensInclusos: [
        'Disponibilizacao do SolarZap conforme politica operacional do plano',
        'Ativacao operacional minima',
        'Treinamento base gravado quando aplicavel',
        'Escopo controlado de implantacao e continuidade recorrente',
      ],
      itensNaoInclusos: [
        'Acompanhamento semanal',
        'Suporte continuo via WhatsApp',
        'Landing page salvo registro expresso',
        'Escopo ampliado de implementacao',
      ],
      flags: {
        suporteWhatsapp: false,
        reuniaoExtra: false,
        landingPage: false,
        treinamentoGravado: true,
        solarZapMesUm: true,
        acompanhamentoSemanal: false,
        trafegoPago: false,
      },
    },
    plano_b: {
      codigo: 'plano_b',
      nome: 'Plano Implantacao Guiada',
      quantidadeReunioesImplantacao: 1,
      descricaoObjetiva:
        'Implantacao guiada com 1 reuniao de coleta e alinhamento, 1 mes de SolarZap e trafego pago.',
      itensInclusos: [
        '1 reuniao de coleta e alinhamento',
        '1 mes de SolarZap',
        'Trafego pago',
        'Treinamento base gravado',
        'Continuidade operacional recorrente conforme contrato',
      ],
      itensNaoInclusos: [
        'Suporte ampliado via WhatsApp salvo previsao expressa',
        'Landing page salvo condicao especial expressa',
        'Reuniao extra salvo condicao especial expressa',
      ],
      flags: {
        suporteWhatsapp: false,
        reuniaoExtra: false,
        landingPage: false,
        treinamentoGravado: true,
        solarZapMesUm: true,
        acompanhamentoSemanal: false,
        trafegoPago: true,
      },
    },
    plano_c: {
      codigo: 'plano_c',
      nome: 'Plano Implementacao Completa',
      quantidadeReunioesImplantacao: 1,
      descricaoObjetiva:
        'Implementacao completa com acompanhamento semanal, suporte via WhatsApp na implantacao e continuidade operacional recorrente.',
      itensInclusos: [
        'Tudo do Plano B',
        'Acompanhamento semanal durante a implantacao',
        'Suporte via WhatsApp durante a implantacao',
        'Maior proximidade operacional na fase inicial',
      ],
      itensNaoInclusos: [
        'Landing page sem registro em condicao especial',
        'Reuniao extra sem registro em condicao especial',
        'Escopos fora do anexo do plano ou resumo comercial final',
      ],
      flags: {
        suporteWhatsapp: true,
        reuniaoExtra: false,
        landingPage: false,
        treinamentoGravado: true,
        solarZapMesUm: true,
        acompanhamentoSemanal: true,
        trafegoPago: true,
      },
    },
  } as const;

  const base = definitions[planCode];
  const includeReuniaoExtra = values?.includeReuniaoExtra === true;
  const includeLandingPage = values?.includeLandingPage === true;
  const meetings =
    values?.quantidadeReunioesImplantacao ?? base.quantidadeReunioesImplantacao;

  return {
    ...base,
    quantidadeReunioesImplantacao: includeReuniaoExtra ? meetings + 1 : meetings,
    valorImplantacao: Number(values?.valorImplantacao ?? 0),
    valorRecorrente: Number(values?.valorRecorrente ?? 0),
    flags: {
      ...base.flags,
      reuniaoExtra: includeReuniaoExtra,
      landingPage: includeLandingPage,
    },
  };
};

const deepMerge = (base: Record<string, unknown>, override: Record<string, unknown>) => {
  const output = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      output[key] &&
      typeof output[key] === 'object' &&
      !Array.isArray(output[key])
    ) {
      output[key] = deepMerge(output[key] as Record<string, unknown>, value as Record<string, unknown>);
      continue;
    }
    output[key] = value;
  }
  return output;
};

export const buildInitialContractValues = (input: BuildDefaultsInput) => {
  const lockFields = input.prefill?.lockFields ?? [];
  const defaultPlanCode = input.prefill?.planoSugerido || 'plano_b';
  const specialActive = asBoolean(input.prefill?.condicaoEspecialAtiva);

  const values = {
    legalData: {
      contratante: {
        razaoSocial: asString(input.prefill?.empresaRazaoSocial || input.prefill?.empresaNome),
        nomeFantasia: asString(input.prefill?.empresaNome),
        cnpj: asString(input.prefill?.cnpj),
        endereco: {
          logradouro: '',
          numero: '',
          complemento: '',
          bairro: '',
          cidade: '',
          estado: '',
          cep: '',
        },
      },
      responsavel: {
        nome: asString(input.prefill?.responsavelNome),
        nacionalidade: 'brasileiro',
        estadoCivil: '',
        profissao: '',
        cpf: '',
        rg: '',
        cargo: '',
        email: asString(input.prefill?.responsavelEmail),
        telefone: asString(input.prefill?.responsavelTelefone),
      },
      contratada: {
        razaoSocial: envString('CONTRACTOR_RAZAO_SOCIAL', 'Arkan Desenvolvimento de Software Ltda.'),
        nomeFantasia: envString('CONTRACTOR_NOME_FANTASIA', 'ARKAN SOLAR'),
        cnpj: envString('CONTRACTOR_CNPJ', '60.838.685/0001-71'),
        endereco: envString('CONTRACTOR_ENDERECO', 'Marilia/SP'),
        representanteNome: envString('CONTRACTOR_REPRESENTANTE_NOME', 'Representante Legal ARKAN'),
        representanteCpf: envString('CONTRACTOR_REPRESENTANTE_CPF', 'CPF em configuracao'),
      },
      plano: buildPlanSnapshot(defaultPlanCode, {
        valorImplantacao: 0,
        valorRecorrente: 0,
        includeLandingPage: false,
        includeReuniaoExtra: false,
      }),
      condicaoEspecial: {
        ativa: specialActive,
        descricao: asString(input.prefill?.condicaoEspecialDescricao),
        observacoesComerciais: '',
        incluiReuniaoExtra: false,
        incluiLandingPage: false,
      },
      pagamento: {
        dataAssinatura: todayIso(),
        dataInicio: todayIso(),
        dataPrimeiroVencimento: todayIso(),
        diaVencimentoMensal: 1,
        formaPagamentoImplantacao: 'Pix',
        formaPagamentoRecorrencia: 'boleto mensal',
        valorImplantacao: 0,
        valorRecorrente: 0,
      },
      recorrencia: {
        vigenciaInicialMeses: 3,
        prazoCancelamentoDias: 30,
        prazoExportacaoDadosDias: 30,
        multaInadimplenciaPercentual: 2,
        jurosInadimplenciaPercentual: 1,
        renovacaoAutomaticaMensal: true,
        faseUmDescricao: 'Mes 1 = implantacao inicial',
        faseDoisDescricao: 'Meses 2 e 3 = continuidade operacional recorrente',
      },
      assinatura: {
        plataformaNome: envString('CONTRACT_SIGNATURE_PLATFORM_NAME', 'ZapSign'),
        plataformaUrl: envString('CONTRACT_SIGNATURE_PLATFORM_URL', 'https://www.zapsign.com.br/'),
      },
      foro: {
        cidade: envString('CONTRACT_FORO_CIDADE', 'Marilia'),
        estado: envString('CONTRACT_FORO_ESTADO', 'SP'),
      },
    },
    internalMetadata: {
      contractDraftId: input.draftId,
      contractNumber: input.contractNumber,
      contractVersion: 1,
      templateVersion: CONTRACT_TEMPLATE_VERSION,
      leadId: asString(input.leadId),
      opportunityId: asString(input.opportunityId),
      organizationId: input.orgId,
      sellerUserId: input.sellerUserId,
      createdByUserId: input.sellerUserId,
      lastUpdatedByUserId: input.sellerUserId,
      contractStatus: 'draft',
      signatureStatus: 'not_requested',
      signatureProvider: envString('CONTRACT_SIGNATURE_PLATFORM_NAME', 'ZapSign'),
      signatureEnvelopeId: '',
      pdfStoragePath: '',
      previewStoragePath: '',
      checksumHash: '',
      source: {
        sourceContext: 'apresentacao_arkanlabs',
        generatedFrom: 'landing_embed',
        embedOrigin: input.allowedOrigin,
        embedSource: 'public_embed',
        salesSessionId: asString(input.prefill?.salesSessionId),
        prefillLockedFields: lockFields,
      },
      eventLog: [],
    },
  };

  return {
    ...values,
    internalMetadata: {
      ...values.internalMetadata,
      checksumHash: createChecksumHash(values),
    },
  };
};

export const normalizeContractValues = (
  row: {
    id: string;
    contract_number: string;
    org_id: string;
    seller_user_id?: string | null;
    created_by_user_id?: string | null;
    lead_id?: number | null;
    opportunity_id?: number | null;
    embed_origin?: string | null;
    legal_data?: Record<string, unknown> | null;
    internal_metadata?: Record<string, unknown> | null;
  },
  sessionPrefill?: ContractEmbedPrefill | null,
) => {
  const defaults = buildInitialContractValues({
    draftId: row.id,
    contractNumber: row.contract_number,
    orgId: row.org_id,
    sellerUserId: asString(row.seller_user_id || row.created_by_user_id),
    leadId: row.lead_id ? String(row.lead_id) : '',
    opportunityId: row.opportunity_id ? String(row.opportunity_id) : '',
    allowedOrigin: asString(row.embed_origin) || 'https://apresentacao.arkanlabs.com.br',
    prefill: sessionPrefill,
  });

  const legalData = row.legal_data && typeof row.legal_data === 'object'
    ? deepMerge(defaults.legalData as Record<string, unknown>, row.legal_data)
    : defaults.legalData;

  const internalMetadata = row.internal_metadata && typeof row.internal_metadata === 'object'
    ? deepMerge(defaults.internalMetadata as Record<string, unknown>, row.internal_metadata)
    : defaults.internalMetadata;

  const normalized = {
    legalData,
    internalMetadata,
  };

  return applyLockedPrefillFields(normalized, sessionPrefill);
};

export const applyLockedPrefillFields = (
  values: { legalData: Record<string, any>; internalMetadata: Record<string, any> },
  sessionPrefill?: ContractEmbedPrefill | null,
) => {
  if (!sessionPrefill) return values;
  const next = structuredClone(values);
  const lockFields = sessionPrefill.lockFields || [];
  next.legalData = next.legalData || {};
  next.legalData.contratante = next.legalData.contratante || {};
  next.legalData.responsavel = next.legalData.responsavel || {};
  next.legalData.condicaoEspecial = next.legalData.condicaoEspecial || {};
  next.legalData.pagamento = next.legalData.pagamento || {};
  next.legalData.plano = next.legalData.plano || buildPlanSnapshot('plano_b');
  next.internalMetadata = next.internalMetadata || {};
  next.internalMetadata.source = next.internalMetadata.source || {};

  const applyIfLocked = (field: string, writer: () => void) => {
    if (lockFields.includes(field)) writer();
  };

  applyIfLocked('empresaNome', () => {
    next.legalData.contratante.nomeFantasia = asString(sessionPrefill.empresaNome);
  });
  applyIfLocked('empresaRazaoSocial', () => {
    next.legalData.contratante.razaoSocial = asString(
      sessionPrefill.empresaRazaoSocial || sessionPrefill.empresaNome,
    );
  });
  applyIfLocked('cnpj', () => {
    next.legalData.contratante.cnpj = asString(sessionPrefill.cnpj);
  });
  applyIfLocked('responsavelNome', () => {
    next.legalData.responsavel.nome = asString(sessionPrefill.responsavelNome);
  });
  applyIfLocked('responsavelEmail', () => {
    next.legalData.responsavel.email = asString(sessionPrefill.responsavelEmail);
  });
  applyIfLocked('responsavelTelefone', () => {
    next.legalData.responsavel.telefone = asString(sessionPrefill.responsavelTelefone);
  });
  applyIfLocked('planoSugerido', () => {
    const currentPayment = next.legalData.pagamento || {};
    const currentSpecial = next.legalData.condicaoEspecial || {};
    next.legalData.plano = buildPlanSnapshot(
      (sessionPrefill.planoSugerido || 'plano_b') as ContractPlanCode,
      {
        valorImplantacao: Number(currentPayment.valorImplantacao || 0),
        valorRecorrente: Number(currentPayment.valorRecorrente || 0),
        quantidadeReunioesImplantacao: Number(
          next.legalData.plano?.quantidadeReunioesImplantacao || 0,
        ),
        includeReuniaoExtra: currentSpecial.incluiReuniaoExtra === true,
        includeLandingPage: currentSpecial.incluiLandingPage === true,
      },
    );
  });
  applyIfLocked('condicaoEspecialAtiva', () => {
    next.legalData.condicaoEspecial.ativa = asBoolean(sessionPrefill.condicaoEspecialAtiva);
  });
  applyIfLocked('condicaoEspecialDescricao', () => {
    next.legalData.condicaoEspecial.descricao = asString(
      sessionPrefill.condicaoEspecialDescricao,
    );
  });
  applyIfLocked('sellerUserId', () => {
    next.internalMetadata.sellerUserId = asString(sessionPrefill.sellerUserId);
  });
  applyIfLocked('salesSessionId', () => {
    next.internalMetadata.source.salesSessionId = asString(sessionPrefill.salesSessionId);
  });

  next.internalMetadata.source.prefillLockedFields = lockFields;
  next.internalMetadata.checksumHash = createChecksumHash(next);
  return next;
};

export const buildContractCommercialSummary = (values: {
  legalData: Record<string, any>;
}) => ({
  contratanteNome: asString(values.legalData?.contratante?.razaoSocial),
  responsavelNome: asString(values.legalData?.responsavel?.nome),
  planoNome: asString(values.legalData?.plano?.nome),
  planoCodigo: asString(values.legalData?.plano?.codigo),
  valorImplantacao: Number(values.legalData?.pagamento?.valorImplantacao || 0),
  valorRecorrente: Number(values.legalData?.pagamento?.valorRecorrente || 0),
  dataInicio: asString(values.legalData?.pagamento?.dataInicio),
  primeiroVencimento: asString(values.legalData?.pagamento?.dataPrimeiroVencimento),
  diaVencimentoMensal: Number(values.legalData?.pagamento?.diaVencimentoMensal || 0),
  quantidadeReunioesImplantacao: Number(
    values.legalData?.plano?.quantidadeReunioesImplantacao || 0,
  ),
  suporteWhatsapp: values.legalData?.plano?.flags?.suporteWhatsapp === true,
  landingPage: values.legalData?.plano?.flags?.landingPage === true,
  reuniaoExtra: values.legalData?.plano?.flags?.reuniaoExtra === true,
  acompanhamentoSemanal: values.legalData?.plano?.flags?.acompanhamentoSemanal === true,
  treinamentoGravado: values.legalData?.plano?.flags?.treinamentoGravado === true,
  solarZapMesUm: values.legalData?.plano?.flags?.solarZapMesUm === true,
  trafegoPago: values.legalData?.plano?.flags?.trafegoPago === true,
  condicaoEspecialAtiva: values.legalData?.condicaoEspecial?.ativa === true,
  descricaoCondicaoEspecial: asString(values.legalData?.condicaoEspecial?.descricao),
  observacoesComerciais: asString(
    values.legalData?.condicaoEspecial?.observacoesComerciais,
  ),
  foro: `${asString(values.legalData?.foro?.cidade)}/${asString(values.legalData?.foro?.estado)}`,
  plataformaAssinatura: asString(values.legalData?.assinatura?.plataformaNome),
});

export const createContractEventEntry = (
  values: { internalMetadata: Record<string, any> },
  input: { type: string; userId: string; previousStatus: string | null; nextStatus: string | null; message: string },
) => ({
  id: createEventId(),
  type: input.type,
  previousStatus: input.previousStatus,
  nextStatus: input.nextStatus,
  createdAt: new Date().toISOString(),
  createdByUserId: input.userId,
  message: input.message,
  payload: {},
});

export const appendContractEventEntry = (
  values: { internalMetadata: Record<string, any> },
  eventEntry: Record<string, unknown>,
) => {
  const next = structuredClone(values);
  const currentLog = Array.isArray(next.internalMetadata.eventLog)
    ? next.internalMetadata.eventLog
    : [];
  next.internalMetadata.eventLog = [...currentLog, eventEntry];
  next.internalMetadata.lastUpdatedByUserId = eventEntry.createdByUserId;
  next.internalMetadata.contractStatus = eventEntry.nextStatus ?? next.internalMetadata.contractStatus;
  next.internalMetadata.checksumHash = createChecksumHash(next);
  return next;
};
