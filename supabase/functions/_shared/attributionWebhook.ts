type AnyRecord = Record<string, unknown>;

export type WebhookPayload = Record<string, string | null>;

export type WebhookBlocklistSettings = {
  blocklist_ips?: unknown;
  blocklist_phones?: unknown;
};

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): AnyRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as AnyRecord;
}

function primitiveToString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

export function onlyDigits(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
}

export function normalizePhoneE164(value: string | null | undefined): string | null {
  const digits = onlyDigits(value);
  if (!digits) return null;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  return cleaned.toLowerCase();
}

export function pickPayloadValue(payload: WebhookPayload, keys: string[]): string | null {
  for (const key of keys) {
    const cleaned = cleanString(payload[key]);
    if (cleaned) return cleaned;
  }
  return null;
}

function fromObjectLike(input: unknown): WebhookPayload {
  const output: WebhookPayload = {};
  const obj = asRecord(input);
  if (!obj) return output;

  Object.entries(obj).forEach(([key, rawValue]) => {
    if (rawValue === null || rawValue === undefined) {
      output[key] = null;
      return;
    }

    const direct = primitiveToString(rawValue);
    if (direct !== null) {
      output[key] = direct;
      return;
    }

    if (Array.isArray(rawValue)) {
      const firstPrimitive = rawValue.map(primitiveToString).find((value) => value !== null);
      if (firstPrimitive !== undefined) {
        output[key] = firstPrimitive || null;
      }
    }
  });

  return output;
}

export async function parseWebhookPayload(req: Request): Promise<WebhookPayload> {
  const contentType = (req.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('application/json')) {
    try {
      const body = await req.json();
      return fromObjectLike(body);
    } catch {
      return {};
    }
  }

  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    try {
      const form = await req.formData();
      const output: WebhookPayload = {};
      for (const [key, value] of form.entries()) {
        output[key] = typeof value === 'string' ? value : cleanString(value.name);
      }
      return output;
    } catch {
      return {};
    }
  }

  try {
    const text = await req.text();
    if (!text.trim()) return {};

    try {
      return fromObjectLike(JSON.parse(text));
    } catch {
      const params = new URLSearchParams(text);
      const output: WebhookPayload = {};
      params.forEach((value, key) => {
        output[key] = value;
      });
      return output;
    }
  } catch {
    return {};
  }
}

export function extractClientIp(req: Request): string | null {
  const forwarded = cleanString(req.headers.get('x-forwarded-for'));
  if (forwarded) {
    const first = cleanString(forwarded.split(',')[0]);
    if (first) return first;
  }

  return (
    cleanString(req.headers.get('cf-connecting-ip')) ||
    cleanString(req.headers.get('x-real-ip')) ||
    null
  );
}

export function isHoneypotTriggered(payload: WebhookPayload): boolean {
  return cleanString(payload._szap_honeypot) !== null;
}

function normalizeBlocklist(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => cleanString(typeof value === 'string' ? value : primitiveToString(value)))
    .filter((value): value is string => !!value)
    .map((value) => value.toLowerCase());
}

export function isBlockedBySettings(
  settings: WebhookBlocklistSettings,
  payload: { ip: string | null; phone: string | null },
): { blocked: boolean; reason: 'ip' | 'phone' | null } {
  const ip = cleanString(payload.ip)?.toLowerCase() || null;
  const phone = normalizePhoneE164(payload.phone) || null;

  const ipBlocklist = normalizeBlocklist(settings.blocklist_ips);
  if (ip && ipBlocklist.includes(ip)) {
    return { blocked: true, reason: 'ip' };
  }

  const phoneBlocklist = normalizeBlocklist(settings.blocklist_phones);
  if (phone && phoneBlocklist.length > 0) {
    const phoneDigits = onlyDigits(phone);
    const phoneDigitsWithoutCountry = phoneDigits.replace(/^55/, '');

    for (const blockedEntry of phoneBlocklist) {
      const blockedDigits = onlyDigits(blockedEntry);
      if (!blockedDigits) continue;

      if (
        blockedDigits === phoneDigits ||
        blockedDigits === phoneDigitsWithoutCountry ||
        blockedDigits.replace(/^55/, '') === phoneDigitsWithoutCountry
      ) {
        return { blocked: true, reason: 'phone' };
      }
    }
  }

  return { blocked: false, reason: null };
}

export function extractRecaptchaToken(payload: WebhookPayload): string | null {
  return pickPayloadValue(payload, ['g-recaptcha-response', 'g_recaptcha_response', 'recaptcha_token']);
}

export function buildRawQueryString(payload: WebhookPayload): string | null {
  const keys = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'gclid',
    'gbraid',
    'wbraid',
    'fbclid',
    'ttclid',
    'msclkid',
  ];

  const params = new URLSearchParams();
  keys.forEach((key) => {
    const value = cleanString(payload[key]);
    if (value) params.set(key, value);
  });

  const encoded = params.toString();
  return encoded.length > 0 ? encoded : null;
}

export function cleanPayloadString(value: string | null | undefined): string | null {
  return cleanString(value);
}

