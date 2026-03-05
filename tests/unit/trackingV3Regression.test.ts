import { describe, expect, it, vi } from 'vitest';
import { buildConversionEventIdempotencyKey } from '@/lib/tracking/router';
import { buildUniversalAttributionSnippet, mergeSnippetAttributionState } from '@/lib/tracking/snippet';
import {
  backoffSecondsForAttempt,
  computeNextAttemptAtIso,
  createInMemoryDeliveryClaimer,
  resolvePlatformEventNameFromStageMap,
  resolveGoogleClickId,
  shouldRequeueStaleDelivery,
  type DeliveryLike,
} from '../../supabase/functions/_shared/conversionDispatcher.ts';
import {
  buildTouchpointFingerprint,
  inferChannel,
  shouldOverwriteChannel,
} from '../../supabase/functions/_shared/trackingAttribution.ts';
import {
  handleAttributionWebhook,
  type AttributionWebhookDeps,
  type AttributionWebhookRepo,
  type OrgTrackingSettingsRow,
} from '../../supabase/functions/_shared/attributionWebhookService.ts';

function createWebhookDeps(overrides?: Partial<AttributionWebhookRepo>): AttributionWebhookDeps {
  const settings: OrgTrackingSettingsRow = {
    org_id: 'org-1',
    rate_limit_per_minute: 60,
    recaptcha_enabled: false,
    recaptcha_secret_vault_id: null,
    force_channel_overwrite: false,
    auto_channel_attribution: true,
    blocklist_ips: [],
    blocklist_phones: [],
  };

  const repo: AttributionWebhookRepo = {
    getOrgSettingsByPublicKey: vi.fn(async () => settings),
    consumeRateLimit: vi.fn(async () => ({
      allowed: true,
      remaining: 59,
      limit_per_minute: 60,
      current_count: 1,
    })),
    resolveOrgPrimaryUserId: vi.fn(async () => 'user-1'),
    findLeadByPhone: vi.fn(async () => null),
    createLead: vi.fn(async () => ({ id: 101 })),
    patchLead: vi.fn(async () => {}),
    getSecretByVaultId: vi.fn(async () => null),
    ...overrides,
  };

  return {
    allowedOrigin: '*',
    repo,
    applyAttribution: vi.fn(async () => ({
      attribution_id: 'attr-1',
      inferred_channel: 'google_ads',
      channel_inferred: true,
      channel_updated: true,
      attribution_method: 'utm_clickid',
      trigger_message_rule_id: null,
    })),
    verifyRecaptcha: vi.fn(async () => true),
  };
}

describe('tracking v3 regression coverage', () => {
  it('keeps same idempotency key when lead re-enters the same stage', async () => {
    const first = await buildConversionEventIdempotencyKey({
      orgId: 'org-1',
      leadId: 77,
      crmStage: 'Contrato Assinado',
      eventName: 'sale_closed',
    });

    const second = await buildConversionEventIdempotencyKey({
      orgId: 'org-1',
      leadId: 77,
      crmStage: 'contrato_assinado',
      eventName: 'sale_closed',
    });

    expect(first).toBe(second);
  });

  it('changes idempotency key when stage changes', async () => {
    const contract = await buildConversionEventIdempotencyKey({
      orgId: 'org-1',
      leadId: 77,
      crmStage: 'contrato_assinado',
      eventName: 'sale_closed',
    });

    const paid = await buildConversionEventIdempotencyKey({
      orgId: 'org-1',
      leadId: 77,
      crmStage: 'projeto_pago',
      eventName: 'sale_closed',
    });

    expect(contract).not.toBe(paid);
  });

  it('simulates SKIP LOCKED behavior without duplicate claims', async () => {
    const nowIso = new Date().toISOString();
    const deliveries: DeliveryLike[] = [
      { id: 'd1', platform: 'meta', status: 'pending', attempt_count: 0, max_attempts: 5, next_attempt_at: nowIso },
      { id: 'd2', platform: 'google_ads', status: 'pending', attempt_count: 0, max_attempts: 5, next_attempt_at: nowIso },
      { id: 'd3', platform: 'ga4', status: 'pending', attempt_count: 0, max_attempts: 5, next_attempt_at: nowIso },
    ];

    const claim = createInMemoryDeliveryClaimer(deliveries);
    const [workerA, workerB] = await Promise.all([claim(2), claim(2)]);
    const ids = [...workerA, ...workerB].map((row) => row.id);

    expect(new Set(ids).size).toBe(3);
    expect(ids.sort()).toEqual(['d1', 'd2', 'd3']);
  });

  it('applies exact retry backoff sequence', () => {
    expect(backoffSecondsForAttempt(1)).toBe(30);
    expect(backoffSecondsForAttempt(2)).toBe(60);
    expect(backoffSecondsForAttempt(3)).toBe(300);
    expect(backoffSecondsForAttempt(4)).toBe(1800);
    expect(backoffSecondsForAttempt(5)).toBe(3600);

    const baseMs = 1_700_000_000_000;
    expect(computeNextAttemptAtIso(1, baseMs)).toBe(new Date(baseMs + 30_000).toISOString());
    expect(computeNextAttemptAtIso(5, baseMs)).toBe(new Date(baseMs + 3_600_000).toISOString());
  });

  it('marks stale processing deliveries after 3 minutes', () => {
    const nowMs = 1_700_000_000_000;
    const stale = new Date(nowMs - 181_000).toISOString();
    const boundary = new Date(nowMs - 180_000).toISOString();
    const fresh = new Date(nowMs - 60_000).toISOString();

    expect(shouldRequeueStaleDelivery(stale, nowMs)).toBe(true);
    expect(shouldRequeueStaleDelivery(boundary, nowMs)).toBe(false);
    expect(shouldRequeueStaleDelivery(fresh, nowMs)).toBe(false);
  });

  it('respects channel guard and preserves manual channel', () => {
    const inferred = inferChannel(
      {
        orgId: 'org-1',
        leadId: 77,
        messageText: 'quero proposta',
        gclid: 'gclid-1',
      },
      null,
    );

    expect(inferred.inferred_channel).toBe('google_ads');
    expect(shouldOverwriteChannel('indicacao', false, false)).toBe(false);
    expect(shouldOverwriteChannel('indicacao', true, false)).toBe(true);
  });

  it('drops honeypot webhook requests with no lead side effects', async () => {
    const deps = createWebhookDeps();
    const request = new Request('https://example.com/functions/v1/attribution-webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-szap-org-key': 'public-key',
      },
      body: JSON.stringify({
        phone: '(11) 98888-7777',
        _szap_honeypot: 'bot-filled',
      }),
    });

    const response = await handleAttributionWebhook(request, deps);
    expect(response.status).toBe(204);
    expect((deps.repo.createLead as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect((deps.applyAttribution as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('returns 429 when webhook rate limit is exceeded', async () => {
    const deps = createWebhookDeps({
      consumeRateLimit: vi.fn(async () => ({
        allowed: false,
        remaining: 0,
        limit_per_minute: 60,
        current_count: 60,
      })),
    });

    const request = new Request('https://example.com/functions/v1/attribution-webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-szap-org-key': 'public-key',
      },
      body: JSON.stringify({ phone: '(11) 98888-7777' }),
    });

    const response = await handleAttributionWebhook(request, deps);
    expect(response.status).toBe(429);
    expect((deps.repo.createLead as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('keeps touchpoint fingerprint deterministic and unique by attribution payload', async () => {
    const first = await buildTouchpointFingerprint({
      orgId: 'org-1',
      leadId: 77,
      utm_source: 'google',
      utm_campaign: 'campaign-a',
      gclid: 'gclid-1',
      session_id: 'sess-1',
      landing_page_url: 'https://lp.example.com/a',
      referrer_url: 'https://google.com',
    });

    const same = await buildTouchpointFingerprint({
      orgId: 'org-1',
      leadId: 77,
      utm_source: 'google',
      utm_campaign: 'campaign-a',
      gclid: 'gclid-1',
      session_id: 'sess-1',
      landing_page_url: 'https://lp.example.com/a',
      referrer_url: 'https://google.com',
    });

    const changed = await buildTouchpointFingerprint({
      orgId: 'org-1',
      leadId: 77,
      utm_source: 'google',
      utm_campaign: 'campaign-b',
      gclid: 'gclid-1',
      session_id: 'sess-1',
      landing_page_url: 'https://lp.example.com/a',
      referrer_url: 'https://google.com',
    });

    expect(first).toBe(same);
    expect(first).not.toBe(changed);
  });

  it('resolves google click-id priority as gclid > gbraid > wbraid', () => {
    expect(resolveGoogleClickId({ gclid: 'gclid', gbraid: 'gbraid', wbraid: 'wbraid' })).toEqual({
      type: 'gclid',
      value: 'gclid',
    });
    expect(resolveGoogleClickId({ gclid: null, gbraid: 'gbraid', wbraid: 'wbraid' })).toEqual({
      type: 'gbraid',
      value: 'gbraid',
    });
    expect(resolveGoogleClickId({ gclid: null, gbraid: null, wbraid: 'wbraid' })).toEqual({
      type: 'wbraid',
      value: 'wbraid',
    });
  });

  it('skips dispatch when stage is explicitly unmapped for a platform', () => {
    const mapped = resolvePlatformEventNameFromStageMap({
      stageEventMap: {
        contrato_assinado: {
          event_key: 'contrato_assinado',
          meta: null,
          google_ads: null,
          ga4: null,
        },
      },
      crmStage: 'contrato_assinado',
      platform: 'meta',
      fallbackEventName: 'contrato_assinado',
    });

    expect(mapped).toBeNull();
  });

  it('keeps fallback event when stage has no explicit mapping', () => {
    const mapped = resolvePlatformEventNameFromStageMap({
      stageEventMap: {},
      crmStage: 'etapa_custom',
      platform: 'ga4',
      fallbackEventName: 'etapa_custom',
    });

    expect(mapped).toBe('etapa_custom');
  });

  it('prefers _fbc/_fbp cookies over derived fbc values', () => {
    const merged = mergeSnippetAttributionState({
      storedState: { fbclid: 'stored-fbclid' },
      currentParams: new URLSearchParams('fbclid=query-fbclid&utm_source=google'),
      locationHref: 'https://lp.example.com/form',
      referrer: 'https://facebook.com',
      cookieHeader: '_fbc=fb.1.1700000000.cookie; _fbp=fb.1.1700000000.pixel',
      nowMs: 1_700_000_000_999,
    });

    expect(merged._szap_fbc).toBe('fb.1.1700000000.cookie');
    expect(merged._szap_fbp).toBe('fb.1.1700000000.pixel');
    expect(merged.utm_source).toBe('google');
  });

  it('derives fbc from fbclid when cookie is missing and snippet has hydration logic', () => {
    const merged = mergeSnippetAttributionState({
      storedState: {},
      currentParams: new URLSearchParams('fbclid=query-fbclid'),
      locationHref: 'https://lp.example.com/form',
      referrer: '',
      cookieHeader: '',
      nowMs: 1_700_000_001_111,
    });

    expect(merged._szap_fbc).toBe('fb.1.1700000001111.query-fbclid');

    const snippet = buildUniversalAttributionSnippet();
    expect(snippet).toContain('sessionStorage.getItem');
    expect(snippet).toContain("document.querySelectorAll('form')");
  });
});
