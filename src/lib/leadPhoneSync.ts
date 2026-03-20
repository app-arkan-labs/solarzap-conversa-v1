import { normalizePhoneE164, normalizePhoneForStorage } from '@/lib/phoneUtils';

export type LeadPhoneSyncFields = {
  telefone: string | null;
  phone_e164: string | null;
};

export function buildLeadPhoneSyncFields(phone: string | undefined | null): LeadPhoneSyncFields {
  const telefone = normalizePhoneForStorage(phone) || null;
  const phone_e164 = normalizePhoneE164(phone);
  return { telefone, phone_e164 };
}
