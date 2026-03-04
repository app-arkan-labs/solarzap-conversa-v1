export const STAGE_UPDATE_EMPTY_ERROR = 'Nenhum lead atualizado. Verifique permissões/escopo da organização.';

export const assertLeadStageUpdateApplied = (updatedRows: unknown[] | null | undefined): void => {
  if (!updatedRows?.length) {
    throw new Error(STAGE_UPDATE_EMPTY_ERROR);
  }
};
