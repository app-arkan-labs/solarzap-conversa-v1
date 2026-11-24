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
      'Implantação mais enxuta, com escopo controlado e sem acompanhamento semanal recorrente.',
    itensInclusos: [
      'Disponibilização do SolarZap conforme política operacional do plano',
      'Ativação operacional mínima',
      'Treinamento base gravado quando aplicável',
      'Escopo controlado de implantação e continuidade recorrente',
    ],
    itensNaoInclusos: [
      'Acompanhamento semanal',
      'Suporte contínuo via WhatsApp',
      'Landing page salvo registro expresso',
      'Escopo ampliado de implementação',
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
    nome: 'Plano Implantação Guiada',
    quantidadeReunioesImplantacao: 1,
    descricaoObjetiva:
      'Implantação guiada com 1 reunião de coleta e alinhamento, 1 mês de SolarZap e tráfego pago.',
    itensInclusos: [
      '1 reuniao de coleta e alinhamento',
      '1 mês de SolarZap',
      'Tráfego pago',
      'Treinamento base gravado',
      'Continuidade operacional recorrente conforme contrato',
    ],
    itensNaoInclusos: [
      'Suporte ampliado via WhatsApp salvo previsão expressa',
      'Landing page salvo condição especial expressa',
      'Reunião extra salvo condição especial expressa',
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
    nome: 'Plano Implementação Completa',
    quantidadeReunioesImplantacao: 1,
    descricaoObjetiva:
      'Implementação completa com acompanhamento semanal, suporte via WhatsApp na implantação e continuidade operacional recorrente.',
    itensInclusos: [
      'Tudo do Plano B',
      'Acompanhamento semanal durante a implantação',
      'Suporte via WhatsApp durante a implantação',
      'Maior proximidade operacional na fase inicial',
    ],
    itensNaoInclusos: [
      'Landing page sem registro em condição especial',
      'Reunião extra sem registro em condição especial',
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
  { value: 'plano_b', label: 'Plano Implantação Guiada' },
  { value: 'plano_c', label: 'Plano Implementação Completa' },
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
