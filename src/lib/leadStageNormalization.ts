import { PIPELINE_STAGES, type PipelineStage } from '@/types/solarzap';

const FALLBACK_STAGE: PipelineStage = 'novo_lead';

const normalizeToken = (value: unknown): string => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const canonicalStages = new Set<PipelineStage>(Object.keys(PIPELINE_STAGES) as PipelineStage[]);

const stageAliases: Record<string, PipelineStage> = {
  novo: 'novo_lead',
  lead: 'novo_lead',
  proposta_em_negociacao: 'proposta_negociacao',
  coletar_avaliacao_90_dias: 'coletar_avaliacao',
  perdido_desqualificado: 'perdido',
};

for (const [stage, info] of Object.entries(PIPELINE_STAGES) as [PipelineStage, { title: string }][]) {
  const normalizedTitle = normalizeToken(info.title);
  if (normalizedTitle) {
    stageAliases[normalizedTitle] = stage;
  }
}

export const normalizeLeadStage = (value: unknown): PipelineStage => {
  const normalized = normalizeToken(value);
  if (!normalized) return FALLBACK_STAGE;

  if (canonicalStages.has(normalized as PipelineStage)) {
    return normalized as PipelineStage;
  }

  return stageAliases[normalized] || FALLBACK_STAGE;
};

export const resolveImportedPipelineStage = (input: {
  statusPipeline?: unknown;
  statusPipelineCode?: unknown;
}): PipelineStage => {
  const preferred = String(input.statusPipelineCode ?? '').trim();
  if (preferred) {
    return normalizeLeadStage(preferred);
  }

  return normalizeLeadStage(input.statusPipeline);
};

