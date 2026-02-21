import { PipelineStage } from '@/types/solarzap';

export const AI_PIPELINE_UI_STAGES: PipelineStage[] = [
  'novo_lead',
  'respondeu',
  'nao_compareceu',
  'proposta_negociacao',
  'financiamento',
];

const AI_PIPELINE_UI_STAGE_SET = new Set<string>(AI_PIPELINE_UI_STAGES);

export const isAIPipelineUIStage = (stage: string | null | undefined): boolean => {
  if (!stage) return false;
  return AI_PIPELINE_UI_STAGE_SET.has(stage);
};
