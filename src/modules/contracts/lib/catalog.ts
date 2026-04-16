import type { ContractPlanCode, ContractPlanSnapshot } from './domain';

type BasePlanDefinition = Omit<
  ContractPlanSnapshot,
  'valorImplantacao' | 'valorRecorrente'
>;

const PLAN_DEFINITIONS: Record<ContractPlanCode, BasePlanDefinition> = {
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
};

export const CONTRACT_PLAN_OPTIONS = [
  { value: 'plano_a', label: 'Plano Essencial / Downsell' },
  { value: 'plano_b', label: 'Plano Implantacao Guiada' },
  { value: 'plano_c', label: 'Plano Implementacao Completa' },
] as const;

export const getBasePlanDefinition = (planCode: ContractPlanCode) =>
  PLAN_DEFINITIONS[planCode];

export const buildPlanSnapshot = (
  planCode: ContractPlanCode,
  values?: {
    valorImplantacao?: number;
    valorRecorrente?: number;
    quantidadeReunioesImplantacao?: number;
    includeReuniaoExtra?: boolean;
    includeLandingPage?: boolean;
  },
): ContractPlanSnapshot => {
  const base = PLAN_DEFINITIONS[planCode];
  const includeReuniaoExtra = values?.includeReuniaoExtra === true;
  const includeLandingPage = values?.includeLandingPage === true;
  const quantidadeBase =
    values?.quantidadeReunioesImplantacao ?? base.quantidadeReunioesImplantacao;
  const quantidadeReunioesImplantacao = includeReuniaoExtra
    ? quantidadeBase + 1
    : quantidadeBase;

  return {
    ...base,
    quantidadeReunioesImplantacao,
    valorImplantacao: Number(values?.valorImplantacao ?? 0),
    valorRecorrente: Number(values?.valorRecorrente ?? 0),
    flags: {
      ...base.flags,
      reuniaoExtra: includeReuniaoExtra,
      landingPage: includeLandingPage,
    },
  };
};
