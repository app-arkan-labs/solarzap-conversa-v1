export type RecipientChannel = 'whatsapp' | 'email';

export type MergeRecipientsResult = {
  next: string[];
  added: string[];
  invalid: string[];
  parsedCount: number;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitRawRecipients(raw: string): string[] {
  return raw
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toUnique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function normalizeWhatsappRecipient(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function normalizeEmailRecipient(raw: string): string | null {
  const normalized = String(raw || '').trim().toLowerCase();
  if (!normalized) return null;
  if (!EMAIL_REGEX.test(normalized)) return null;
  return normalized;
}

export function normalizeRecipient(raw: string, channel: RecipientChannel): string | null {
  if (channel === 'whatsapp') return normalizeWhatsappRecipient(raw);
  return normalizeEmailRecipient(raw);
}

export function normalizeRecipients(values: string[], channel: RecipientChannel): string[] {
  const normalized: string[] = [];
  for (const value of values) {
    const out = normalizeRecipient(value, channel);
    if (out) normalized.push(out);
  }
  return toUnique(normalized);
}

export function mergeRecipientInput(
  currentValues: string[],
  rawInput: string,
  channel: RecipientChannel,
): MergeRecipientsResult {
  const parsed = splitRawRecipients(rawInput);
  const current = normalizeRecipients(currentValues, channel);
  const next = [...current];
  const seen = new Set(current);
  const added: string[] = [];
  const invalid: string[] = [];

  for (const token of parsed) {
    const normalized = normalizeRecipient(token, channel);
    if (!normalized) {
      invalid.push(token);
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
    added.push(normalized);
  }

  return {
    next,
    added,
    invalid,
    parsedCount: parsed.length,
  };
}

export function removeRecipient(
  currentValues: string[],
  recipientToRemove: string,
  channel: RecipientChannel,
): string[] {
  const normalizedCurrent = normalizeRecipients(currentValues, channel);
  const normalizedTarget = normalizeRecipient(recipientToRemove, channel);
  if (!normalizedTarget) return normalizedCurrent;
  return normalizedCurrent.filter((item) => item !== normalizedTarget);
}
