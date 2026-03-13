import { describe, expect, it } from 'vitest';
import {
  buildUniversalAttributionSnippet,
  mergeSnippetAttributionState,
  parseCookieValue,
} from '@/lib/tracking/snippet';

describe('tracking snippet helpers', () => {
  it('prefers _fbc/_fbp cookies over derived values', () => {
    const merged = mergeSnippetAttributionState({
      storedState: { fbclid: 'fbclid_from_storage' },
      currentParams: new URLSearchParams('utm_source=google&fbclid=fbclid_from_query'),
      locationHref: 'https://lp.example.com/produto',
      referrer: 'https://google.com',
      cookieHeader: '_fbc=fb.1.1700000000.cookie; _fbp=fb.1.1700000000.abc',
      nowMs: 1700000000123,
    });

    expect(merged._szap_fbc).toBe('fb.1.1700000000.cookie');
    expect(merged._szap_fbp).toBe('fb.1.1700000000.abc');
    expect(merged.utm_source).toBe('google');
    expect(merged._szap_lp).toBe('https://lp.example.com/produto');
  });

  it('derives _szap_fbc from fbclid when cookie is absent', () => {
    const merged = mergeSnippetAttributionState({
      storedState: { fbclid: 'abc123' },
      currentParams: new URLSearchParams(),
      locationHref: 'https://lp.example.com',
      referrer: '',
      cookieHeader: '',
      nowMs: 1700000000999,
    });

    expect(merged._szap_fbc).toBe('fb.1.1700000000999.abc123');
    expect(merged._szap_fbp).toBeUndefined();
  });

  it('parses cookies safely', () => {
    expect(parseCookieValue('_fbp=123; _fbc=456', '_fbc')).toBe('456');
    expect(parseCookieValue('_fbp=123', '_fbc')).toBeNull();
  });

  it('builds a snippet that persists attribution and injects hidden fields', () => {
    const snippet = buildUniversalAttributionSnippet();
    expect(snippet).toContain('sessionStorage.setItem');
    expect(snippet).toContain("document.querySelectorAll('form')");
    expect(snippet).toContain('fb.1.');
  });
});

