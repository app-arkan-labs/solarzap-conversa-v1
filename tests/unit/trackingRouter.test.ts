import { describe, expect, it } from 'vitest';
import {
  buildConversionEventIdempotencyKey,
  listEnabledTrackingPlatforms,
  resolveStageEventEntry,
} from '@/lib/tracking/router';

describe('tracking router helpers', () => {
  it('resolves stage mapping with event_key fallback', () => {
    const stageEntry = resolveStageEventEntry('contrato_assinado', {
      contrato_assinado: {
        event_key: 'sale_closed',
        meta: 'Purchase',
        google_ads: 'purchase',
        ga4: 'purchase',
      },
    });

    expect(stageEntry.event_key).toBe('sale_closed');
    expect(stageEntry.meta).toBe('Purchase');
  });

  it('falls back to normalized stage slug when map does not define stage', () => {
    const stageEntry = resolveStageEventEntry('Etapa Custom', null);
    expect(stageEntry.event_key).toBe('etapa_custom');
    expect(stageEntry.google_ads).toBeNull();
  });

  it('lists only enabled tracking platforms', () => {
    expect(
      listEnabledTrackingPlatforms({
        meta_capi_enabled: true,
        google_ads_enabled: false,
        ga4_enabled: true,
      }),
    ).toEqual(['meta', 'ga4']);
  });

  it('builds deterministic conversion idempotency keys', async () => {
    const keyA = await buildConversionEventIdempotencyKey({
      orgId: 'org-1',
      leadId: 10,
      crmStage: 'Contrato Assinado',
      eventName: 'sale_closed',
    });

    const keyB = await buildConversionEventIdempotencyKey({
      orgId: 'org-1',
      leadId: 10,
      crmStage: 'contrato_assinado',
      eventName: 'sale_closed',
    });

    const keyC = await buildConversionEventIdempotencyKey({
      orgId: 'org-1',
      leadId: 10,
      crmStage: 'projeto_pago',
      eventName: 'sale_closed',
    });

    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });
});

