const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parseFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;
  return TRUTHY_VALUES.has(value.trim().toLowerCase());
}

function readFeatureFlag(name: string): boolean {
  // Check process.env first (allows test overrides), then import.meta.env (Vite runtime)
  const nodeValue = typeof process !== 'undefined' ? process.env[name] : undefined;
  if (nodeValue !== undefined) return parseFlag(nodeValue);
  const viteValue = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.[name];
  return parseFlag(viteValue);
}

export function isUnifiedGenerationEnabled(): boolean {
  return readFeatureFlag('VITE_USE_UNIFIED_GENERATION');
}

export function isSolarResourceApiEnabled(): boolean {
  return readFeatureFlag('VITE_USE_SOLAR_RESOURCE_API');
}

export function isOmCostModelEnabled(): boolean {
  return readFeatureFlag('VITE_USE_OM_COST_MODEL');
}

export function isDegradationAllClientsEnabled(): boolean {
  return readFeatureFlag('VITE_USE_DEGRADATION_ALL_CLIENTS');
}

export function isTusdTeSimplifiedEnabled(): boolean {
  return readFeatureFlag('VITE_USE_TUSD_TE_SIMPLIFIED');
}

export function isPdfRendererV2Enabled(): boolean {
  return readFeatureFlag('VITE_USE_PDF_RENDERER_V2');
}

export function isFinancialShadowModeEnabled(): boolean {
  return readFeatureFlag('VITE_USE_FINANCIAL_SHADOW_MODE');
}
