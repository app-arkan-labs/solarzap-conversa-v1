const FALLBACK_TIMEZONES = [
  'America/Sao_Paulo',
  'America/Araguaina',
  'America/Bahia',
  'America/Belem',
  'America/Boa_Vista',
  'America/Campo_Grande',
  'America/Cuiaba',
  'America/Eirunepe',
  'America/Fortaleza',
  'America/Maceio',
  'America/Manaus',
  'America/Noronha',
  'America/Porto_Velho',
  'America/Recife',
  'America/Rio_Branco',
  'America/Santarem',
  'UTC',
] as const;

let cachedSupportedTimezones: string[] | null = null;

export const getSupportedTimezones = (): string[] => {
  if (cachedSupportedTimezones) {
    return cachedSupportedTimezones;
  }

  const intlWithSupportedValuesOf = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };

  if (typeof intlWithSupportedValuesOf.supportedValuesOf === 'function') {
    try {
      const values = intlWithSupportedValuesOf.supportedValuesOf('timeZone');
      if (values.length > 0) {
        cachedSupportedTimezones = values;
        return cachedSupportedTimezones;
      }
    } catch {
      // Fall through to fallback list.
    }
  }

  cachedSupportedTimezones = [...FALLBACK_TIMEZONES];
  return cachedSupportedTimezones;
};

export const normalizeSupportedTimezone = (raw: unknown, fallback = 'America/Sao_Paulo'): string => {
  const supported = getSupportedTimezones();
  const supportedSet = new Set(supported);

  const normalizedFallback = String(fallback || 'America/Sao_Paulo').trim();
  const safeFallback = supportedSet.has(normalizedFallback)
    ? normalizedFallback
    : (supported[0] || 'America/Sao_Paulo');

  const candidate = String(raw ?? '').trim();
  if (!candidate) {
    return safeFallback;
  }

  return supportedSet.has(candidate) ? candidate : safeFallback;
};
