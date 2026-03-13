import { describe, expect, it } from 'vitest';
import {
  buildTouchpointFingerprint,
  extractCtwaFromWhatsAppMessage,
  inferChannel,
  matchTriggerRule,
  shouldOverwriteChannel,
  type TriggerRule,
} from '../../supabase/functions/_shared/trackingAttribution.ts';

describe('tracking attribution helpers', () => {
  it('keeps manual channel when guard is active', () => {
    expect(shouldOverwriteChannel('indication', false, false)).toBe(false);
    expect(shouldOverwriteChannel('', false, false)).toBe(true);
    expect(shouldOverwriteChannel('google_ads', true, false)).toBe(true);
    expect(shouldOverwriteChannel('google_ads', false, true)).toBe(true);
  });

  it('matches trigger rules respecting type and order', () => {
    const rules: TriggerRule[] = [
      { id: '1', trigger_text: 'quero proposta', match_type: 'exact', inferred_channel: 'facebook_ads' },
      { id: '2', trigger_text: 'simulacao', match_type: 'contains', inferred_channel: 'google_ads' },
      { id: '3', trigger_text: '^promo', match_type: 'regex', inferred_channel: 'instagram' },
    ];

    expect(matchTriggerRule('quero proposta', rules)?.id).toBe('1');
    expect(matchTriggerRule('quero simulacao agora', rules)?.id).toBe('2');
    expect(matchTriggerRule('promocao ativa', rules)?.id).toBe('3');
  });

  it('infers channel with ctwa priority', () => {
    const matchedRule: TriggerRule = {
      id: 'rule-1',
      trigger_text: 'simulacao',
      match_type: 'contains',
      inferred_channel: 'google_ads',
    };

    const result = inferChannel(
      {
        orgId: 'org',
        leadId: 1,
        messageText: 'quero simulacao',
        gclid: 'gclid_123',
        ctwa: {
          ctwa_source_url: 'https://instagram.com/ads',
          ctwa_source_type: 'instagram',
          ctwa_source_id: '123',
          ctwa_headline: null,
          ctwa_body: null,
          ctwa_clid: null,
        },
      },
      matchedRule,
    );

    expect(result.inferred_channel).toBe('instagram');
    expect(result.attribution_method).toBe('ctwa');
  });

  it('extracts CTWA fields from WhatsApp payload', () => {
    const ctwa = extractCtwaFromWhatsAppMessage(
      {
        message: {
          extendedTextMessage: {
            contextInfo: {
              externalAdReply: {
                sourceUrl: 'https://facebook.com/ad',
                sourceType: 'facebook',
                sourceId: 'abc123',
                title: 'Ad headline',
                body: 'Ad body',
                ctwaClid: 'clid123',
              },
            },
          },
        },
      },
      'extendedTextMessage',
    );

    expect(ctwa?.ctwa_source_url).toBe('https://facebook.com/ad');
    expect(ctwa?.ctwa_source_type).toBe('facebook');
    expect(ctwa?.ctwa_clid).toBe('clid123');
  });

  it('builds deterministic touchpoint fingerprints', async () => {
    const a = await buildTouchpointFingerprint({
      orgId: 'org',
      leadId: 1,
      utm_source: 'google',
      utm_campaign: 'campanha-a',
      gclid: 'gclid_1',
      landing_page_url: 'https://lp.example.com',
      referrer_url: 'https://google.com',
      session_id: 'sess-1',
    });

    const b = await buildTouchpointFingerprint({
      orgId: 'org',
      leadId: 1,
      utm_source: 'google',
      utm_campaign: 'campanha-a',
      gclid: 'gclid_1',
      landing_page_url: 'https://lp.example.com',
      referrer_url: 'https://google.com',
      session_id: 'sess-1',
    });

    const c = await buildTouchpointFingerprint({
      orgId: 'org',
      leadId: 1,
      utm_source: 'google',
      utm_campaign: 'campanha-b',
      gclid: 'gclid_1',
      landing_page_url: 'https://lp.example.com',
      referrer_url: 'https://google.com',
      session_id: 'sess-1',
    });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

