import { getDefaultStageEventMap, type StageEventMap, type StageEventMapEntry } from '@/lib/tracking/constants';
import { PIPELINE_STAGES, type PipelineStage } from '@/types/solarzap';
import { MATCH_TYPE_OPTIONS, CHANNEL_OPTIONS } from './constants';
import type { TriggerRow } from './types';

export function parseStageMap(input: unknown): StageEventMap {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return getDefaultStageEventMap();
  const out: StageEventMap = {};
  Object.entries(input as Record<string, unknown>).forEach(([stage, raw]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const row = raw as Partial<StageEventMapEntry>;
    if (!row.event_key || typeof row.event_key !== 'string') return;
    out[stage] = {
      event_key: row.event_key,
      meta: row.meta || null,
      google_ads: row.google_ads || null,
      ga4: row.ga4 || null,
    };
  });
  return Object.keys(out).length > 0 ? out : getDefaultStageEventMap();
}

export function formatStageLabel(stage: string): string {
  const fromPipeline = PIPELINE_STAGES[stage as PipelineStage]?.title;
  if (fromPipeline) return fromPipeline;

  return stage
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatPlatform(value: string): string {
  if (value === 'meta') return 'Meta CAPI';
  if (value === 'google_ads') return 'Google Ads';
  if (value === 'ga4') return 'GA4';
  return value;
}

export function formatDeliveryStatus(value: string): string {
  if (value === 'pending') return 'Pendente';
  if (value === 'processing') return 'Processando';
  if (value === 'sent') return 'Enviado';
  if (value === 'failed') return 'Falhou';
  if (value === 'skipped') return 'Ignorado';
  if (value === 'disabled') return 'Desativado';
  return value;
}

export function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('pt-BR');
}

export function formatMatchType(value: TriggerRow['match_type']): string {
  return MATCH_TYPE_OPTIONS.find((option) => option.value === value)?.label || value;
}

export function formatChannel(value: string): string {
  return CHANNEL_OPTIONS.find((option) => option.value === value)?.label || value;
}

export function statusLabel(s: string): string {
  return s === 'connected' ? 'Conectado' : s === 'incomplete' ? 'Incompleto' : 'Desativado';
}

export function statusColor(s: string): string {
  return s === 'connected'
    ? 'bg-emerald-500/10 text-emerald-700'
    : s === 'incomplete'
      ? 'bg-amber-500/10 text-amber-700'
      : 'bg-muted text-muted-foreground';
}
