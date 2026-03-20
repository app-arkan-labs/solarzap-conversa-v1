import { buildLeadPhoneSyncFields } from '@/lib/leadPhoneSync';

describe('leadPhoneSync', () => {
  it('keeps telefone and phone_e164 synchronized for valid BR numbers', () => {
    expect(buildLeadPhoneSyncFields('(11) 98765-4321')).toEqual({
      telefone: '5511987654321',
      phone_e164: '5511987654321',
    });
  });

  it('keeps international digits as canonical value', () => {
    expect(buildLeadPhoneSyncFields('+44 20 7183 8750')).toEqual({
      telefone: '442071838750',
      phone_e164: '442071838750',
    });
  });

  it('keeps raw digits in telefone when invalid and nulls phone_e164', () => {
    expect(buildLeadPhoneSyncFields('12345')).toEqual({
      telefone: '12345',
      phone_e164: null,
    });
    expect(buildLeadPhoneSyncFields('')).toEqual({
      telefone: null,
      phone_e164: null,
    });
  });
});
