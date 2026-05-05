import {
  getInternalCrmStageMeta,
  normalizeInternalCrmStageCode,
} from '@/modules/internal-crm/components/pipeline/stageCatalog';
import type {
  InternalCrmClientDetail,
  InternalCrmConversationSummary,
  InternalCrmDealSummary,
} from '@/modules/internal-crm/types';

const DEFAULT_STAGE_CODE = 'novo_lead';
const DEFAULT_STAGE_COLOR = '#64748b';

function asStageCode(value: unknown): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return normalizeInternalCrmStageCode(normalized);
}

function toTime(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function resolvePrimaryOpenDeal(deals: InternalCrmDealSummary[]): InternalCrmDealSummary | null {
  const openDeals = deals.filter((deal) => deal.status === 'open');
  if (openDeals.length === 0) return null;
  const [primary] = [...openDeals].sort((a, b) => {
    const byUpdate = toTime(b.updated_at) - toTime(a.updated_at);
    if (byUpdate !== 0) return byUpdate;
    return toTime(b.created_at) - toTime(a.created_at);
  });
  return primary || null;
}

export function resolveInternalCrmPipelineStageCode(input: {
  conversation?: InternalCrmConversationSummary | null;
  detail?: InternalCrmClientDetail | null;
}): string {
  const conversation = input.conversation || null;
  const detail = input.detail || null;
  const detailPrimaryOpenDeal = resolvePrimaryOpenDeal(detail?.deals || []);

  return (
    asStageCode(detailPrimaryOpenDeal?.stage_code) ||
    asStageCode(conversation?.primary_open_deal_stage_code) ||
    asStageCode(detail?.client?.current_stage_code) ||
    asStageCode(conversation?.current_stage_code) ||
    DEFAULT_STAGE_CODE
  );
}

export function resolveInternalCrmPipelineStageView(input: {
  conversation?: InternalCrmConversationSummary | null;
  detail?: InternalCrmClientDetail | null;
}) {
  const stageCode = resolveInternalCrmPipelineStageCode(input);
  const stageMeta = getInternalCrmStageMeta(stageCode);

  const fallbackLabel = String(input.conversation?.stage_label || '').trim();
  const fallbackColor = String(input.conversation?.stage_color || '').trim();

  return {
    code: stageCode,
    label: stageMeta?.label || fallbackLabel || 'Novo Lead',
    color: stageMeta?.color || fallbackColor || DEFAULT_STAGE_COLOR,
    icon: stageMeta?.icon || 'N',
  };
}
