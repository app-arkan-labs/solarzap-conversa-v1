import { normalizeChannelValue } from '@/lib/channelNormalization';

describe('channelNormalization', () => {
  it('maps known aliases to canonical channels', () => {
    expect(normalizeChannelValue('Whats App')).toBe('whatsapp');
    expect(normalizeChannelValue('lista fria')).toBe('cold_list');
    expect(normalizeChannelValue('Meta Ads')).toBe('facebook_ads');
  });

  it('keeps canonical values as-is', () => {
    expect(normalizeChannelValue('google_ads')).toBe('google_ads');
    expect(normalizeChannelValue('indication')).toBe('indication');
  });

  it('falls back to other for empty or unknown channels', () => {
    expect(normalizeChannelValue('')).toBe('other');
    expect(normalizeChannelValue(null)).toBe('other');
    expect(normalizeChannelValue('canal_inexistente')).toBe('other');
  });
});
