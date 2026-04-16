import { buildPlanSnapshot } from './catalog';
import { synchronizeContractValues } from './derivations';
import { createDefaultContractFormValues } from './schema';
import type { ContractFormalizationFormValues } from './schema';

export const createSolarPrimeMockContract = (
  overrides?: Partial<ContractFormalizationFormValues>,
) => {
  const base = createDefaultContractFormValues();

  const plan = buildPlanSnapshot('plano_c', {
    valorImplantacao: 2000,
    valorRecorrente: 1500,
    includeReuniaoExtra: true,
    includeLandingPage: true,
  });

  const merged: ContractFormalizationFormValues = {
    ...base,
    legalData: {
      ...base.legalData,
      contratante: {
        razaoSocial: 'Solar Prime Energia Ltda',
        nomeFantasia: 'Solar Prime',
        cnpj: '12.345.678/0001-99',
        endereco: {
          logradouro: 'Rua Exemplo',
          numero: '123',
          complemento: '',
          bairro: 'Centro',
          cidade: 'Marilia',
          estado: 'SP',
          cep: '17500-000',
        },
      },
      responsavel: {
        nome: 'Joao Pedro Martins',
        nacionalidade: 'brasileiro',
        estadoCivil: 'solteiro',
        profissao: 'empresario',
        cpf: '123.456.789-00',
        rg: '12.345.678-9',
        cargo: 'Diretor Comercial',
        email: 'joao@solarprime.com.br',
        telefone: '(14) 99999-9999',
      },
      plano: plan,
      condicaoEspecial: {
        ativa: true,
        descricao: 'reuniao extra de coleta completa + landing page incluida',
        observacoesComerciais:
          'Bonus valido dentro da contratacao, sem cobranca adicional apartada.',
        incluiReuniaoExtra: true,
        incluiLandingPage: true,
      },
      pagamento: {
        dataAssinatura: '2026-04-16',
        dataInicio: '2026-04-20',
        dataPrimeiroVencimento: '2026-04-20',
        diaVencimentoMensal: 20,
        formaPagamentoImplantacao: 'Pix',
        formaPagamentoRecorrencia: 'boleto mensal',
        valorImplantacao: 2000,
        valorRecorrente: 1500,
      },
      recorrencia: {
        ...base.legalData.recorrencia,
        vigenciaInicialMeses: 3,
      },
      assinatura: {
        ...base.legalData.assinatura,
        plataformaNome: 'ZapSign',
      },
      foro: {
        cidade: 'Marilia',
        estado: 'SP',
      },
    },
    internalMetadata: {
      ...base.internalMetadata,
      source: {
        ...base.internalMetadata.source,
        sourceContext: 'contract_module_mock',
        generatedFrom: 'mock_seed',
      },
    },
  };

  return synchronizeContractValues({
    ...merged,
    ...overrides,
  });
};
