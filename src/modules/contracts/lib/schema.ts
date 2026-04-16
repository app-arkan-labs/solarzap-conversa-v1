import { z } from 'zod';
import {
  CONTRACT_SIGNATURE_STATUS_VALUES,
  CONTRACT_STATUS_VALUES,
  CONTRACT_TEMPLATE_VERSION,
  type ContractExternalPrefill,
} from './domain';
import {
  DEFAULT_CONTRACTOR_PROFILE,
  DEFAULT_FORUM_TERMS,
  DEFAULT_RECURRENCE_TERMS,
  DEFAULT_SIGNATURE_TERMS,
} from './config';
import { buildPlanSnapshot } from './catalog';
import { createContractDraftId, createContractNumber } from './formatters';

const nonEmptyText = (label: string) =>
  z.string().trim().min(1, `${label} e obrigatorio.`);

const optionalText = z.string().trim().default('');

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use uma data valida.');

export const contractCompanyAddressSchema = z.object({
  logradouro: nonEmptyText('Logradouro'),
  numero: nonEmptyText('Numero'),
  complemento: optionalText,
  bairro: nonEmptyText('Bairro'),
  cidade: nonEmptyText('Cidade'),
  estado: nonEmptyText('Estado').max(2, 'Use a sigla do estado.'),
  cep: nonEmptyText('CEP'),
});

export const contractingCompanySchema = z.object({
  razaoSocial: nonEmptyText('Razao social'),
  nomeFantasia: nonEmptyText('Nome fantasia'),
  cnpj: nonEmptyText('CNPJ'),
  endereco: contractCompanyAddressSchema,
});

export const legalRepresentativeSchema = z.object({
  nome: nonEmptyText('Nome do responsavel'),
  nacionalidade: nonEmptyText('Nacionalidade'),
  estadoCivil: nonEmptyText('Estado civil'),
  profissao: nonEmptyText('Profissao'),
  cpf: nonEmptyText('CPF'),
  rg: nonEmptyText('RG'),
  cargo: nonEmptyText('Cargo'),
  email: nonEmptyText('E-mail').email('Use um e-mail valido.'),
  telefone: nonEmptyText('Telefone'),
});

export const contractorPartySchema = z.object({
  razaoSocial: nonEmptyText('Razao social da contratada'),
  nomeFantasia: nonEmptyText('Nome fantasia da contratada'),
  cnpj: nonEmptyText('CNPJ da contratada'),
  endereco: nonEmptyText('Endereco da contratada'),
  representanteNome: nonEmptyText('Representante da contratada'),
  representanteCpf: nonEmptyText('CPF do representante da contratada'),
});

export const contractPlanFlagsSchema = z.object({
  suporteWhatsapp: z.boolean(),
  reuniaoExtra: z.boolean(),
  landingPage: z.boolean(),
  treinamentoGravado: z.boolean(),
  solarZapMesUm: z.boolean(),
  acompanhamentoSemanal: z.boolean(),
  trafegoPago: z.boolean(),
});

export const contractPlanSchema = z.object({
  codigo: z.enum(['plano_a', 'plano_b', 'plano_c']),
  nome: nonEmptyText('Plano'),
  valorImplantacao: z.coerce.number().min(0, 'Valor invalido.'),
  valorRecorrente: z.coerce.number().min(0, 'Valor invalido.'),
  quantidadeReunioesImplantacao: z.coerce.number().min(0).max(20),
  descricaoObjetiva: nonEmptyText('Descricao do plano'),
  itensInclusos: z.array(z.string().trim()).default([]),
  itensNaoInclusos: z.array(z.string().trim()).default([]),
  flags: contractPlanFlagsSchema,
});

export const contractSpecialConditionSchema = z.object({
  ativa: z.boolean(),
  descricao: optionalText,
  observacoesComerciais: optionalText,
  incluiReuniaoExtra: z.boolean(),
  incluiLandingPage: z.boolean(),
});

export const contractPaymentTermsSchema = z.object({
  dataAssinatura: dateSchema,
  dataInicio: dateSchema,
  dataPrimeiroVencimento: dateSchema,
  diaVencimentoMensal: z.coerce.number().int().min(1).max(31),
  formaPagamentoImplantacao: nonEmptyText('Forma de pagamento da implantacao'),
  formaPagamentoRecorrencia: nonEmptyText('Forma de pagamento da recorrencia'),
  valorImplantacao: z.coerce.number().min(0),
  valorRecorrente: z.coerce.number().min(0),
});

export const contractRecurrenceTermsSchema = z.object({
  vigenciaInicialMeses: z.coerce.number().int().min(3),
  prazoCancelamentoDias: z.coerce.number().int().min(1),
  prazoExportacaoDadosDias: z.coerce.number().int().min(1),
  multaInadimplenciaPercentual: z.coerce.number().min(0),
  jurosInadimplenciaPercentual: z.coerce.number().min(0),
  renovacaoAutomaticaMensal: z.boolean(),
  faseUmDescricao: nonEmptyText('Descricao da fase 1'),
  faseDoisDescricao: nonEmptyText('Descricao da fase 2'),
});

export const contractSignatureTermsSchema = z.object({
  plataformaNome: nonEmptyText('Plataforma de assinatura'),
  plataformaUrl: nonEmptyText('URL da plataforma'),
});

export const contractForumTermsSchema = z.object({
  cidade: nonEmptyText('Cidade do foro'),
  estado: nonEmptyText('Estado do foro').max(2, 'Use a sigla do estado.'),
});

export const contractSourceContextSchema = z.object({
  sourceContext: optionalText,
  generatedFrom: optionalText,
  embedOrigin: optionalText,
  embedSource: optionalText,
  salesSessionId: optionalText,
  prefillLockedFields: z.array(z.string()).default([]),
});

export const contractInternalMetadataSchema = z.object({
  contractDraftId: nonEmptyText('ID do draft'),
  contractNumber: nonEmptyText('Numero do contrato'),
  contractVersion: z.coerce.number().int().min(1),
  templateVersion: nonEmptyText('Versao do template'),
  leadId: optionalText,
  opportunityId: optionalText,
  organizationId: optionalText,
  sellerUserId: optionalText,
  createdByUserId: optionalText,
  lastUpdatedByUserId: optionalText,
  contractStatus: z.enum(CONTRACT_STATUS_VALUES),
  signatureStatus: z.enum(CONTRACT_SIGNATURE_STATUS_VALUES),
  signatureProvider: optionalText,
  signatureEnvelopeId: optionalText,
  pdfStoragePath: optionalText,
  previewStoragePath: optionalText,
  checksumHash: optionalText,
  source: contractSourceContextSchema,
  eventLog: z.array(z.any()).default([]),
});

export const contractLegalDataSchema = z.object({
  contratante: contractingCompanySchema,
  responsavel: legalRepresentativeSchema,
  contratada: contractorPartySchema,
  plano: contractPlanSchema,
  condicaoEspecial: contractSpecialConditionSchema,
  pagamento: contractPaymentTermsSchema,
  recorrencia: contractRecurrenceTermsSchema,
  assinatura: contractSignatureTermsSchema,
  foro: contractForumTermsSchema,
});

export const contractFormalizationSchema = z.object({
  legalData: contractLegalDataSchema,
  internalMetadata: contractInternalMetadataSchema,
});

export type ContractFormalizationFormValues = z.infer<
  typeof contractFormalizationSchema
>;

const toDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const createDefaultContractFormValues = (
  overrides?: Partial<ContractFormalizationFormValues>,
): ContractFormalizationFormValues => {
  const today = toDateInputValue();
  const plan = buildPlanSnapshot('plano_b', {
    valorImplantacao: 0,
    valorRecorrente: 0,
  });

  return {
    legalData: {
      contratante: {
        razaoSocial: '',
        nomeFantasia: '',
        cnpj: '',
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
        nome: '',
        nacionalidade: 'brasileiro',
        estadoCivil: '',
        profissao: '',
        cpf: '',
        rg: '',
        cargo: '',
        email: '',
        telefone: '',
      },
      contratada: { ...DEFAULT_CONTRACTOR_PROFILE },
      plano: plan,
      condicaoEspecial: {
        ativa: false,
        descricao: '',
        observacoesComerciais: '',
        incluiReuniaoExtra: false,
        incluiLandingPage: false,
      },
      pagamento: {
        dataAssinatura: today,
        dataInicio: today,
        dataPrimeiroVencimento: today,
        diaVencimentoMensal: 1,
        formaPagamentoImplantacao: 'Pix',
        formaPagamentoRecorrencia: 'boleto mensal',
        valorImplantacao: 0,
        valorRecorrente: 0,
      },
      recorrencia: { ...DEFAULT_RECURRENCE_TERMS },
      assinatura: { ...DEFAULT_SIGNATURE_TERMS },
      foro: { ...DEFAULT_FORUM_TERMS },
    },
    internalMetadata: {
      contractDraftId: createContractDraftId(),
      contractNumber: createContractNumber(),
      contractVersion: 1,
      templateVersion: CONTRACT_TEMPLATE_VERSION,
      leadId: '',
      opportunityId: '',
      organizationId: '',
      sellerUserId: '',
      createdByUserId: '',
      lastUpdatedByUserId: '',
      contractStatus: 'draft',
      signatureStatus: 'not_requested',
      signatureProvider: DEFAULT_SIGNATURE_TERMS.plataformaNome,
      signatureEnvelopeId: '',
      pdfStoragePath: '',
      previewStoragePath: '',
      checksumHash: '',
      source: {
        sourceContext: 'solarzap_main',
        generatedFrom: 'internal_app',
        embedOrigin: '',
        embedSource: '',
        salesSessionId: '',
        prefillLockedFields: [],
      },
      eventLog: [],
    },
    ...overrides,
  };
};

export const applyExternalPrefill = (
  values: ContractFormalizationFormValues,
  prefill?: ContractExternalPrefill | null,
): ContractFormalizationFormValues => {
  if (!prefill) return values;

  return {
    ...values,
    legalData: {
      ...values.legalData,
      contratante: {
        ...values.legalData.contratante,
        nomeFantasia:
          prefill.empresaNome ?? values.legalData.contratante.nomeFantasia,
        razaoSocial:
          prefill.empresaRazaoSocial ??
          prefill.empresaNome ??
          values.legalData.contratante.razaoSocial,
        cnpj: prefill.cnpj ?? values.legalData.contratante.cnpj,
      },
      responsavel: {
        ...values.legalData.responsavel,
        nome: prefill.responsavelNome ?? values.legalData.responsavel.nome,
        email: prefill.responsavelEmail ?? values.legalData.responsavel.email,
        telefone:
          prefill.responsavelTelefone ?? values.legalData.responsavel.telefone,
      },
      condicaoEspecial: {
        ...values.legalData.condicaoEspecial,
        ativa:
          prefill.condicaoEspecialAtiva ??
          values.legalData.condicaoEspecial.ativa,
        descricao:
          prefill.condicaoEspecialDescricao ??
          values.legalData.condicaoEspecial.descricao,
      },
      plano:
        prefill.planoSugerido && prefill.planoSugerido !== values.legalData.plano.codigo
          ? buildPlanSnapshot(prefill.planoSugerido, {
              valorImplantacao: values.legalData.pagamento.valorImplantacao,
              valorRecorrente: values.legalData.pagamento.valorRecorrente,
            })
          : values.legalData.plano,
    },
    internalMetadata: {
      ...values.internalMetadata,
      sellerUserId: prefill.sellerUserId ?? values.internalMetadata.sellerUserId,
      source: {
        ...values.internalMetadata.source,
        salesSessionId:
          prefill.salesSessionId ?? values.internalMetadata.source.salesSessionId,
        prefillLockedFields:
          prefill.lockFields ?? values.internalMetadata.source.prefillLockedFields,
      },
    },
  };
};
