import { describe, expect, it, vi } from 'vitest';
import {
  extractClientIp,
  isBlockedBySettings,
  normalizePhoneE164,
  parseWebhookPayload,
} from '../../supabase/functions/_shared/attributionWebhook.ts';
import {
  handleAttributionWebhook,
  type AttributionWebhookDeps,
  type AttributionWebhookRepo,
  type OrgTrackingSettingsRow,
} from '../../supabase/functions/_shared/attributionWebhookService.ts';

function createDeps(overrides?: Partial<AttributionWebhookRepo>): AttributionWebhookDeps {
  const baseSettings: OrgTrackingSettingsRow = {
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
    getOrgSettingsByPublicKey: vi.fn(async () => baseSettings),
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

describe('tracking webhook helpers', () => {
  it('normalizes Brazilian numbers to E164-like format', () => {
    expect(normalizePhoneE164('(11) 98888-7777')).toBe('5511988887777');
    expect(normalizePhoneE164('5511988887777')).toBe('5511988887777');
    expect(normalizePhoneE164('12345')).toBeNull();
  });

  it('extracts client ip from forwarded headers', () => {
    const req = new Request('https://example.com', {
      headers: {
        'x-forwarded-for': '189.10.10.10, 10.0.0.1',
      },
    });
    expect(extractClientIp(req)).toBe('189.10.10.10');
  });

  it('applies ip and phone blocklists', () => {
    expect(
      isBlockedBySettings(
        {
          blocklist_ips: ['1.1.1.1'],
          blocklist_phones: ['5511999999999'],
        },
        { ip: '1.1.1.1', phone: '5511888888888' },
      ).blocked,
    ).toBe(true);

    expect(
      isBlockedBySettings(
        {
          blocklist_ips: ['2.2.2.2'],
          blocklist_phones: ['11999999999'],
        },
        { ip: '8.8.8.8', phone: '5511999999999' },
      ).blocked,
    ).toBe(true);
  });

  it('parses JSON payload for webhook requests', async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '5511999999999', utm_source: 'google' }),
    });

    const payload = await parseWebhookPayload(req);
    expect(payload.phone).toBe('5511999999999');
    expect(payload.utm_source).toBe('google');
  });
});

describe('tracking webhook service', () => {
  it('simulates POST creating lead + attribution', async () => {
    const deps = createDeps();

    const req = new Request('https://example.com/functions/v1/attribution-webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-szap-org-key': 'key-public',
        'x-forwarded-for': '189.22.10.10',
        'user-agent': 'Vitest',
      },
      body: JSON.stringify({
        name: 'Lead Landing',
        phone: '(11) 98888-7777',
        utm_source: 'google',
        gclid: 'gclid_abc',
      }),
    });

    const response = await handleAttributionWebhook(req, deps);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.lead_id).toBe(101);
    expect(body.attribution_id).toBe('attr-1');
    expect(body.channel_inferred).toBe('google_ads');

    const createLeadMock = deps.repo.createLead as ReturnType<typeof vi.fn>;
    const applyAttributionMock = deps.applyAttribution as ReturnType<typeof vi.fn>;
    expect(createLeadMock).toHaveBeenCalledOnce();
    expect(createLeadMock.mock.calls[0][0].phoneE164).toBe('5511988887777');
    expect(applyAttributionMock).toHaveBeenCalledOnce();
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const deps = createDeps({
      consumeRateLimit: vi.fn(async () => ({
        allowed: false,
        remaining: 0,
        limit_per_minute: 60,
        current_count: 60,
      })),
    });

    const req = new Request('https://example.com/functions/v1/attribution-webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-szap-org-key': 'key-public',
      },
      body: JSON.stringify({ phone: '(11) 98888-7777' }),
    });

    const response = await handleAttributionWebhook(req, deps);
    expect(response.status).toBe(429);
  });

  it('drops honeypot submissions with no side effects', async () => {
    const deps = createDeps();

    const req = new Request('https://example.com/functions/v1/attribution-webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-szap-org-key': 'key-public',
      },
      body: JSON.stringify({
        phone: '(11) 98888-7777',
        _szap_honeypot: 'filled-by-bot',
      }),
    });

    const response = await handleAttributionWebhook(req, deps);
    expect(response.status).toBe(204);

    const createLeadMock = deps.repo.createLead as ReturnType<typeof vi.fn>;
    const applyAttributionMock = deps.applyAttribution as ReturnType<typeof vi.fn>;
    expect(createLeadMock).not.toHaveBeenCalled();
    expect(applyAttributionMock).not.toHaveBeenCalled();
  });
});

