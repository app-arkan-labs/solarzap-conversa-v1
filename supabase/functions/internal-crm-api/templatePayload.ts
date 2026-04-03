type TemplatePayloadRecord = Record<string, unknown>;

export function normalizeAutomationTemplateValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
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
