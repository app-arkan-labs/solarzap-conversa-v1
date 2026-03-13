import {
  TRACKING_PLATFORMS,
  normalizeCrmStageSlug,
  type StageEventMap,
  type StageEventMapEntry,
  type TrackingPlatform,
} from './constants';

export type TrackingPlatformSettings = {
  meta_capi_enabled?: boolean | null;
  google_ads_enabled?: boolean | null;
  ga4_enabled?: boolean | null;
};

export function resolveStageEventEntry(
  crmStage: string | null | undefined,
  stageEventMap: StageEventMap | null | undefined,
): StageEventMapEntry {
  const stageSlug = normalizeCrmStageSlug(crmStage);
  const fromMap = stageEventMap?.[stageSlug];
  if (!fromMap) {
    return {
      event_key: stageSlug,
      meta: null,
      google_ads: null,
      ga4: null,
    };
  }

  return {
    event_key: String(fromMap.event_key || stageSlug),
    meta: fromMap.meta || null,
    google_ads: fromMap.google_ads || null,
    ga4: fromMap.ga4 || null,
  };
}

export function listEnabledTrackingPlatforms(settings: TrackingPlatformSettings | null | undefined): TrackingPlatform[] {
  if (!settings) return [];

  const enabled = new Set<TrackingPlatform>();
  if (settings.meta_capi_enabled === true) enabled.add('meta');
  if (settings.google_ads_enabled === true) enabled.add('google_ads');
  if (settings.ga4_enabled === true) enabled.add('ga4');

  return TRACKING_PLATFORMS.filter((platform) => enabled.has(platform));
}

function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(input)).then((digest) => {
    return Array.from(new Uint8Array(digest))
      .map((part) => part.toString(16).padStart(2, '0'))
      .join('');
  });
}

export async function buildConversionEventIdempotencyKey(input: {
  orgId: string;
  leadId: number;
  crmStage: string;
  eventName: string;
}): Promise<string> {
  const payload = `${input.orgId}:${input.leadId}:${normalizeCrmStageSlug(input.crmStage)}:${input.eventName}`;
  return sha256Hex(payload);
}

