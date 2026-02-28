const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parseFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;
  return TRUTHY_VALUES.has(value.trim().toLowerCase());
}

export function isUnifiedGenerationEnabled(): boolean {
  const viteValue = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.VITE_USE_UNIFIED_GENERATION;
  if (viteValue !== undefined) return parseFlag(viteValue);
  const nodeValue = typeof process !== 'undefined' ? process.env.VITE_USE_UNIFIED_GENERATION : undefined;
  return parseFlag(nodeValue);
}
