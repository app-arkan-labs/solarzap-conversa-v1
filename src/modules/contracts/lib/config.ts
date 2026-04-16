import {
  CONTRACT_TEMPLATE_SOURCE_PATH,
  CONTRACT_TEMPLATE_VERSION,
  type ContractForumTerms,
  type ContractRecurrenceTerms,
  type ContractorPartyData,
  type ContractSignatureTerms,
} from './domain';

const env = (key: string, fallback: string) => {
  const candidate = import.meta.env[key];
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : fallback;
};

const envNumber = (key: string, fallback: number) => {
  const candidate = Number(import.meta.env[key]);
  return Number.isFinite(candidate) ? candidate : fallback;
};

export const DEFAULT_CONTRACTOR_PROFILE: ContractorPartyData = {
  razaoSocial: env('VITE_CONTRACTOR_RAZAO_SOCIAL', 'Arkan Desenvolvimento de Software Ltda.'),
  nomeFantasia: env('VITE_CONTRACTOR_NOME_FANTASIA', 'ARKAN SOLAR'),
  cnpj: env('VITE_CONTRACTOR_CNPJ', '60.838.685/0001-71'),
  endereco: env('VITE_CONTRACTOR_ENDERECO', 'Marilia/SP'),
  representanteNome: env('VITE_CONTRACTOR_REPRESENTANTE_NOME', 'Representante Legal ARKAN'),
  representanteCpf: env('VITE_CONTRACTOR_REPRESENTANTE_CPF', 'CPF em configuracao'),
};

export const DEFAULT_SIGNATURE_TERMS: ContractSignatureTerms = {
  plataformaNome: env('VITE_CONTRACT_SIGNATURE_PLATFORM_NAME', 'ZapSign'),
  plataformaUrl: env('VITE_CONTRACT_SIGNATURE_PLATFORM_URL', 'https://www.zapsign.com.br/'),
};

export const DEFAULT_FORUM_TERMS: ContractForumTerms = {
  cidade: env('VITE_CONTRACT_FORO_CIDADE', 'Marilia'),
  estado: env('VITE_CONTRACT_FORO_ESTADO', 'SP'),
};

export const DEFAULT_RECURRENCE_TERMS: ContractRecurrenceTerms = {
  vigenciaInicialMeses: envNumber('VITE_CONTRACT_VIGENCIA_MESES', 3),
  prazoCancelamentoDias: envNumber('VITE_CONTRACT_PRAZO_CANCELAMENTO_DIAS', 30),
  prazoExportacaoDadosDias: envNumber('VITE_CONTRACT_PRAZO_EXPORTACAO_DADOS_DIAS', 30),
  multaInadimplenciaPercentual: envNumber('VITE_CONTRACT_MULTA_PERCENTUAL', 2),
  jurosInadimplenciaPercentual: envNumber('VITE_CONTRACT_JUROS_PERCENTUAL', 1),
  renovacaoAutomaticaMensal: true,
  faseUmDescricao: 'Mes 1 = implantacao inicial',
  faseDoisDescricao: 'Meses 2 e 3 = continuidade operacional recorrente',
};

export const CONTRACT_MODULE_META = {
  templateVersion: CONTRACT_TEMPLATE_VERSION,
  templateSourcePath: CONTRACT_TEMPLATE_SOURCE_PATH,
  storageBucket: 'contracts',
  defaultGeneratedFrom: 'internal_app',
  defaultSourceContext: 'solarzap_main',
};
