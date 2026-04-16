import { buildPlanSnapshot } from './catalog';
import { createChecksumToken } from './formatters';
import type { ContractFormalizationFormValues } from './schema';

export const synchronizeContractValues = (
  values: ContractFormalizationFormValues,
): ContractFormalizationFormValues => {
  const special = values.legalData.condicaoEspecial;
  const payment = values.legalData.pagamento;
  const currentPlan = values.legalData.plano;
  const planSnapshot = buildPlanSnapshot(currentPlan.codigo, {
    valorImplantacao: payment.valorImplantacao,
    valorRecorrente: payment.valorRecorrente,
    quantidadeReunioesImplantacao: currentPlan.quantidadeReunioesImplantacao,
    includeReuniaoExtra: special.incluiReuniaoExtra,
    includeLandingPage: special.incluiLandingPage,
  });

  const checksumSeed = JSON.stringify({
    legalData: values.legalData,
    internalMetadata: {
      contractNumber: values.internalMetadata.contractNumber,
      contractVersion: values.internalMetadata.contractVersion,
      templateVersion: values.internalMetadata.templateVersion,
    },
  });

  return {
    ...values,
    legalData: {
      ...values.legalData,
      plano: {
        ...planSnapshot,
        flags: {
          ...planSnapshot.flags,
          reuniaoExtra: special.incluiReuniaoExtra,
          landingPage: special.incluiLandingPage,
        },
      },
      pagamento: {
        ...payment,
        valorImplantacao: payment.valorImplantacao,
        valorRecorrente: payment.valorRecorrente,
      },
    },
    internalMetadata: {
      ...values.internalMetadata,
      checksumHash: createChecksumToken(checksumSeed),
    },
  };
};
