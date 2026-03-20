import {
  cleanPhoneInput,
  formatPhoneForDisplay,
  normalizePhoneE164,
  normalizePhoneForStorage,
  onlyPhoneDigits,
} from '@/lib/phoneUtils';

describe('phoneUtils', () => {
  it('normalizes BR local numbers to E164-like digits', () => {
    expect(normalizePhoneE164('11987654321')).toBe('5511987654321');
    expect(normalizePhoneE164('(11) 98765-4321')).toBe('5511987654321');
  });

  it('keeps already international digits as-is', () => {
    expect(normalizePhoneE164('+55 (11) 98765-4321')).toBe('5511987654321');
    expect(normalizePhoneE164('+44 20 7183 8750')).toBe('442071838750');
  });

  it('returns null for invalid bounds', () => {
    expect(normalizePhoneE164('12345')).toBeNull();
    expect(normalizePhoneE164('12345678901234567890')).toBeNull();
  });

  it('provides storage-safe fallback when not valid E164', () => {
    expect(normalizePhoneForStorage('11 98765-4321')).toBe('5511987654321');
    expect(normalizePhoneForStorage('12345')).toBe('12345');
    expect(normalizePhoneForStorage('abc')).toBe('');
  });

  it('exposes digit helpers and display formatters', () => {
    expect(onlyPhoneDigits('+55 (11) 98765-4321')).toBe('5511987654321');
    expect(cleanPhoneInput('(11) 98765-4321')).toBe('11987654321');
    expect(formatPhoneForDisplay('5511987654321')).toBe('(11) 98765-4321');
  });
});
