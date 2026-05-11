type TemplatePayloadRecord = Record<string, unknown>;

const NON_PERSON_VALUE_PATTERNS = [
  /@/,
  /https?:\/\//i,
  /\bwww\./i,
  /^\+?[\d\s().-]{7,}$/,
];

const NAME_PREFIXES_TO_SKIP = new Set(['sr', 'sra', 'dr', 'dra', 'mr', 'mrs', 'ms']);
const LOWERCASE_NAME_PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

export function normalizeAutomationTemplateValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function looksLikeNonPersonValue(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return true;
  return NON_PERSON_VALUE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function toTitleCaseToken(token: string): string {
  return token
    .split(/([-'])/g)
    .map((part) => {
      if (part === '-' || part === "'") return part;
      const lowered = part.toLocaleLowerCase('pt-BR');
      const chars = Array.from(lowered);
      if (chars.length === 0) return '';
      return `${chars[0].toLocaleUpperCase('pt-BR')}${chars.slice(1).join('')}`;
    })
    .join('');
}

function extractNameTokens(value: unknown): string[] {
  const raw = normalizeAutomationTemplateValue(value)
    .replace(/[<>()[\]{}"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw || looksLikeNonPersonValue(raw)) return [];

  return [...raw.matchAll(/[\p{L}\p{M}][\p{L}\p{M}'-]*/gu)]
    .map((match) => match[0])
    .filter(Boolean);
}

export function normalizeAutomationPersonFullName(value: unknown, fallback = 'Cliente'): string {
  const tokens = extractNameTokens(value);
  if (tokens.length === 0) return fallback;

  const formattedTokens = tokens
    .map((token, index) => {
      const normalized = token.toLocaleLowerCase('pt-BR');
      if (index > 0 && LOWERCASE_NAME_PARTICLES.has(normalized)) return normalized;
      return toTitleCaseToken(token);
    })
    .filter(Boolean);

  return formattedTokens.join(' ') || fallback;
}

export function normalizeAutomationPersonFirstName(value: unknown, fallback = 'Cliente'): string {
  const tokens = extractNameTokens(value);
  if (tokens.length === 0) return fallback;

  const firstNameToken =
    tokens.find((token) => !NAME_PREFIXES_TO_SKIP.has(token.toLocaleLowerCase('pt-BR').replace(/\./g, ''))) ||
    tokens[0];

  return toTitleCaseToken(firstNameToken) || fallback;
}

export function renderAutomationTemplate(
  template: string | null,
  payload: TemplatePayloadRecord,
): string | null {
  const source = typeof template === 'string' && template.trim().length > 0 ? template : null;
  if (!source) return null;

  return source.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, rawKey) => {
    const key = String(rawKey || '').trim();
    return normalizeAutomationTemplateValue(payload[key]);
  });
}

export function extractAutomationTemplateTokens(template: string | null): string[] {
  const source = typeof template === 'string' ? template : '';
  if (!source) return [];

  const tokens = new Set<string>();
  for (const match of source.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)) {
    const key = String(match[1] || '').trim();
    if (key) tokens.add(key);
  }

  return [...tokens];
}

function hasMeaningfulAutomationTemplateValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as TemplatePayloadRecord).length > 0;
  return false;
}

export function mergeAutomationTemplatePayload(
  basePayload: TemplatePayloadRecord,
  ...sources: Array<TemplatePayloadRecord | null | undefined>
): TemplatePayloadRecord {
  const merged: TemplatePayloadRecord = { ...basePayload };

  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;

    for (const [key, value] of Object.entries(source)) {
      const currentValue = merged[key];
      const hasCurrentValue = hasMeaningfulAutomationTemplateValue(currentValue);
      const hasNextValue = hasMeaningfulAutomationTemplateValue(value);

      if (hasCurrentValue) continue;
      if (!hasNextValue) continue;

      merged[key] = value;
    }
  }

  return merged;
}
